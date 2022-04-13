import { opine, json, urlencoded } from 'https://deno.land/x/opine@1.9.1/mod.ts'; 
import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v2.4/mod.ts";
import { opineCors } from 'https://deno.land/x/cors@v1.2.2/mod.ts';

import dbServices from './services/DBServices.ts';
import { User } from './interfaces/User.ts';
const cryptoKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"],
);

const app = opine();
const SERVER_PORT = 5000;

app.use(json());
app.use(urlencoded());
app.use(opineCors());

app.get('/', (req, res) => {
    console.log("Received a GET request");
    const token = req.headers.get('Authorization');
   
    if(!token || token === '') {
        res.sendStatus(401)
    }
    else {        
        res.redirect(301, '/books');
    }
});

app.get('/books', async (req, res) => {
    const tokenStr = req.headers.get('Authorization');
    const jwt = tokenStr ? tokenStr.split(' ')[1] : undefined;
    if(!jwt || jwt === '') {
        // console.log('Redirecting to /login');
        // res.redirect(301, '/login');
        res.sendStatus(401);
    }  
    else {
        try {
            if(await dbServices.verifyJWT(jwt)) {
                console.log('All is good! JWT is valid');
                // make a call to DB to get all books that are on some shelf       
                const books = await dbServices.getBooksOnShelf();
                console.log('GET books on shelf: ', books.rows);
                res.json({ books: books.rows });
            } 
            else {
                console.log('Expired or invalid JWT, please login again!');
                res.sendStatus(401).send({ msg: "Expired token, please re-login!"});
            }
        } catch (error) {
            console.error(error);
        }
      // Now verify the token is valid and exists in DB for the current user:
        
    }         
});

app.get('/login', (req, res) => {
  res.send(`<div><h2>Please login!</h2><br /><h4>Or register</h4></div>`);
});

app.post('/register', async (req, res) => {
  const newUser: User = {
      userid: '', // will be created later
      username: req.body.username,
      firstName: req.body.firstName, 
      lastName: req.body.lastName,
      thumbnail: req.body.thumbnail,
      password: req.body.password
  }
  console.log('Received POST /register request');
  console.log(`Data received:`);
  console.table(newUser);
  try {
      const result = await dbServices.createNewUser(newUser);
      console.log('User created: ', result);
      res.sendStatus(201).send({msg: "Created!"});
  } catch (error) {
      console.error(error);
      res.sendStatus(500).send({msg: "Couldn't create new user!"});
  }
});

app.post('/logout', async (req, res) => {
    console.log('Received POST /logout request...');
    const obj = req.body;
    // console.log('Obj: ', JSON.stringify(obj));
    const jwt: string = req.body.jwt;
    // const username: string = req.body.username; 
    const result = await dbServices.removeJWT(jwt);
    console.log('Result removing jwt: ', result);
    if(result) {
        res.sendStatus(200);
    }
    else {
        res.sendStatus(500);
    }    
});

app.post('/login', async (req, res) => {
    console.log('Received POST /login request...');
    const obj = req.body;
    console.log('Obj: ', JSON.stringify(obj));
    const username: string = req.body.username;
    const password: string = req.body.password;    
    console.log(`Username: ${username}, password: ${password}`);
    // const result: boolean | undefined = await dbServices.userExists(username, password);
    try {
        const userfound = await dbServices.getUser(username);
        if( userfound ) {
            // Success!
            // Create a JWT, save it and send a copy back to user:            
            const jwt = await create(
                { alg: "HS512", typ: "JWT"}, 
                { username: username, userid: userfound.userid, exp: getNumericDate(60*60) }, 
                cryptoKey
            );  
            // const id = await dbServices.getUserId(username);            
            const save = await dbServices.saveJWT(userfound.userid, jwt);
            console.log('Saving jwt: ', save);
            res.setStatus(201);
            res.send({ username, jwt });                                                            
        }
        else {
            res.setStatus(404)
            .send({ msg: "No such user found!"});
        } 
    } catch (error) {
        console.error(error);
    }       
});

app.post('/search', async (req, res) => {
    console.log('Received POST /search request...');
   
    try {
        const auth = req.headers.get("Authorization");
        if( !auth || auth === '') {
            res.setStatus(401);
            res.send({msg: 'Unauthorized access! Please login first!'});
        }
        else {
            const token = auth.split(' ')[1];
            console.log('JWT token is: ', token);
            const result = await dbServices.findUserByJWT(token);
            console.log("result is: ", result);
            if(result) {
                // const payload = await verify(token, result.password, 'HS512');
                const payload = await verify(token, cryptoKey);
                console.log("Payload: ", payload);
                const query = req.body.query;
                console.log('Query is: ', query);
                const searchResults = await dbServices.findBooks(query);
                if(searchResults) {
                   // console.log('searchResults: ');
                   // console.log(searchResults);
                    res.setStatus(200);
                    res.send({ books: searchResults });
                }
                else {
                    res.setStatus(404).send({msg: 'None found!'});
                }            
            }
        }
    } catch (error) {        
        console.error(error);
        res.setStatus(500).send({msg: error.message});
    }        
})

// app.get('/books', (req, res) => {
//     console.log('Received a GET /books request...')
//     const jwtHeader = req.headers.get('Authorization');
//     const jwt = jwtHeader ? jwtHeader.split(' ')[1] : undefined;
//     console.log('Received JWT: ', jwt);
//     res.send({ books: [] });
// })

app.post('/books', (req, res) => {
    // 1. verify jwt token
    // 2. a. if token OK post new book
    // 2. b. else reject and send message
    const body = req.parsedBody;    
    console.log("POST request body: ", body);
    res.json({ message: "Received a POST request ", body });    
});

app.put('/books/:id', async (req, res) => {
    // 1. verify jwt token
    // 2. a. if token OK update book[id]
    // 2. b. else reject and send message
    try {
        const auth = req.headers.get("Authorization");        
        if( !auth || auth === '') {
            res.setStatus(401);
            res.send({msg: 'Unauthorized access! Please login first!'});
        }
        else {
            const jwt = auth.split(' ')[1];
            const userfound = await dbServices.findUserByJWT(jwt);  
            if(userfound) {
                // If the jwt is expired verify() will throw
                await verify(jwt, cryptoKey);
            } 
             
            const id = req.params.id;
            const body = req.parsedBody;
            
            console.log(`PUT request body. Id: ${id}, body: ${JSON.stringify(body)} `);
            res.json({ message: "Received a PUT request ", id, body });
        } 
    } catch (error) {
        console.error(error);
        res.setStatus(500);
        res.send({msg: error});
    }
           
});

app.delete('/books/:id', (req, res) => {
    // 1. verify jwt token
    // 2. a. if token OK delete book[id]
    // 2. b. else reject and send message
    const id = req.params.id;
    console.log(`DELETE request received with param id: ${id}`);
    res.json({message: "Received a DELETE request", id});
})


app.listen(SERVER_PORT, () => {
    console.log(`Server is listening at ${SERVER_PORT}...`);
});