import { Pool } from "https://deno.land/x/postgres@v0.14.2/mod.ts";
import { QueryArrayResult } from "https://deno.land/x/postgres@v0.14.2/query/query.ts"

import { User } from '../interfaces/User.ts';
import { Book } from '../interfaces/Book.ts';

// import { LoggedUser } from '../interfaces/LoggedUser.ts';

const POOL_CONNECTIONS = 20;

class DBServices {
  private pool: Pool;
  constructor() {
    this.pool = new Pool({
      user: this.getPGConfig().PGUSER,
      database: this.getPGConfig().PGDATABASE,
      hostname: this.getPGConfig().PGHOST,
      password: this.getPGConfig().PGPASSWORD,
      port: this.getPGConfig().PGPORT
    }, POOL_CONNECTIONS);
  }

  private getPGConfig() {  
    const config = {
      PGUSER: Deno.env.get('PGUSER'),
      PGHOST: Deno.env.get('PGHOST'),
      PGDATABASE: Deno.env.get('PGDATABASE'),
      PGPORT: Deno.env.get('PGPORT'),
      PGPASSWORD: Deno.env.get('PGPASSWORD')
    }
    return config;
  }

  async getBooksOnShelf() {
    const client = await this.pool.connect();
    const results = await client.queryArray(`SELECT * FROM books WHERE on_shelf <> $1`, 'none');
    // console.log('Results: ', results);
    client.release();
    return results;
  }
  
  async createNewUser(user: User): Promise<QueryArrayResult<unknown[]> | undefined> {
    try {
      if(!user) {
        throw new Error("Invalid user!");      
      }
      const client = await this.pool.connect();
      const result = await client.queryArray(`INSERT INTO users(
        userid, username, first_name, last_name, thumbnail, password)
      VALUES($1, $2, $3, $4, $5, $6);`, crypto.randomUUID(), 
      user.username, 
      user.firstName, 
      user.lastName, 
      user.thumbnail, 
      user.password);
      client.release();
      return result;
    } catch (error) {
      console.error(error)
    }        
  }

  async userExists(username: string, password: string): Promise<boolean | undefined> { 
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray(`SELECT * FROM users WHERE username = $1 AND 
      password = $2;`, username, password);
      // There must be one user only or no such user.
      if(result.rows && result.rows.length === 1) {
        console.log('Found user: ', result.rows[0]);
        client.release();
        return new Promise<boolean>((resolve) => {
          resolve(true);
        });
      }
      else {
        client.release();
        return new Promise<boolean>((reject) => {
          reject(false);
        });
      }
    } catch (error) {
      console.error(error);      
    }       
  }

  async getUserId(username: string): Promise<string | undefined> {
    if(username === undefined) {
      throw new Error("username is invalid!");
    }
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray<string[]>(`SELECT userid FROM users WHERE username = $1;`, username);
      const { rows } = result;
      console.log('Rows: ', rows);
      client.release();
      if(rows[0].length === 1) {
        return new Promise((resolve) => {
          resolve(rows[0][0]);
        });
      }
      else {
        return new Promise((reject) => {
          reject('No userid found');
        })
      }
    } catch (error) {
      console.error(error);      
    }    
  } 

  async getUser(username: string): Promise<User | undefined> {
    if(username === undefined || username === '') {
      throw new Error("username is invalid!");
    }
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray<string[]>(`SELECT * FROM users WHERE username = $1;`, username);
      const { rows } = result;
      console.log('User record found: ', rows[0]);
      client.release();
      if(rows.length === 1) {
        const userfound = {
          userid: rows[0][0],
          username: rows[0][1],
          firstName: rows[0][2],
          lastName: rows[0][3],
          thumbnail: rows[0][4],
          password: rows[0][5]
        }
        return new Promise((resolve) => {
          resolve(userfound);
        });
      }
      else {
        return new Promise((reject) => {
          reject(undefined);
        })
      }
    } catch (error) {
      console.error(error);      
    }    
  } 

  async verifyJWT(jwt: string): Promise<boolean | undefined> {
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray<string[]>(`SELECT users.username FROM users WHERE logged_users.userid = users.userid AND logged_users.jwt_token = $1`, jwt);
      const { rows } = result;
      console.log('Rows: ', rows);
      client.release();
      if(rows[0].length === 1) {
        return new Promise((resolve) => {
          resolve(true);
        });
      }
      else {
        return new Promise((reject) => {
          reject(false);
        })
      }
    }
    catch(e) {
      console.error(e);      
    }    
  }

  async findUserByJWT(jwt: string): Promise<User | undefined> {
    try {     
      const client = await this.pool.connect();      
      const useridRes = await client.queryArray<string[]>(
        `SELECT userid FROM logged_users WHERE jwt_token = $1;`, 
        jwt
      );
      
      const userid = useridRes.rows[0];
      console.log('userid: ', userid);
      const userRes = await client.queryArray<string[]>(
        `SELECT * FROM users WHERE userid = $1;`, 
        userid[0]
      );
      const user = userRes.rows[0];
      console.log('user: ', user)

      // console.log('findUserByJWT()');      
      // console.log('Rows: ', rows);
      // console.log('rows.length: ', rows.length);
      
      client.release();
      
      if(userRes.rows.length === 1) {
        const result = {
          userid: user[0],
          username: user[1],
          firstName: user[2],
          lastName: user[3],
          thumbnail: user[4],
          password: user[5]
        }
        console.log('User found: ');
      //  console.table(result);
        return new Promise((resolve) => {
          resolve(result);
        });
      }
      else {
        return new Promise((reject) => {
          reject(undefined);
        })
      }
    }
    catch(e) {
      console.error(e);      
    }    
  }

  async saveJWT(userid: string, jwt: string): Promise<QueryArrayResult<unknown[]> | undefined> {
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray(`INSERT INTO logged_users(userid, jwt_token)
        VALUES($1, $2);`, userid, jwt);
      client.release();
      return result;
    }
    catch(error) {
      console.error(error);
    }
  }

  async removeJWT(jwt: string): Promise<boolean | undefined> {
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray(`DELETE FROM logged_users WHERE jwt_token = $1;`, jwt);
      client.release();
      if(result.rows.length >= 0) {
        return new Promise( resolve => resolve(true) );
      }
      else {
        return new Promise( reject => reject(false) );
      }       
    } catch (error) {
      console.error(error);
    }
  }

  private createBookInstance(row: unknown[]): Book {
      const book: Book = {        
        authors: row[0] as string, 
        code1: row[1] as string,
        code2: row[2] as string,
        description: row[3] as string,
        id: row[4] as string,
        infolink: row[5] as string,
        language: row[6] as string,
        maturityRating: row[7] as string,
        pageCount: row[8] as number,
        previewLink: row[9] as string,
        printType: row[10] as string,
        publishedDate: row[11] as string,         
        publisher: row[12] as string,
        smallThumbnail: row[13] as string,
        thumbnail: row[14] as string,
        title: row[15] as string,                
        canonicalLink: row[16] as string,
        onShelf: row[17] as string,
        subtitle: row[18] as string,
        categories: row[19] as string,
        averageRating: row[20] as number,
        ratingsCount: row[21] as number
      }

      return book;
  }

  async findBooks(query: string): Promise<Book[] | undefined> {
    try {
      const client = await this.pool.connect();
      const result = await client.queryArray(`SELECT * FROM books WHERE authors LIKE '%${query}%' OR title LIKE '%${query}%' OR categories LIKE '%${query}%';`);
      client.release();
      console.log("Search results length: ", result.rows.length);
      if(result.rows && result.rows.length >= 0) {
        const books = result.rows.map(row => this.createBookInstance(row));      
        return new Promise( resolve => resolve(books) );
      }
      else {
        return new Promise( reject => reject(undefined) );
      } 
    } catch (error) {
      console.error(error);
    }
  }

  async addBookToShelf(bookid: string, shelf: string, userid: string): Promise<boolean> {
    const client = await this.pool.connect();
    console.log('bookid: ', bookid);
    console.log('shelf: ', shelf);
    console.log('userid: ', userid);
    const bookresult = await client.queryArray(`SELECT * FROM users_books_junction WHERE bookid = $1`, bookid);
    const { rows } = bookresult;
    if(rows.length === 1) {
      
    }
    // const isBook = await 
    switch(shelf) {
      case 'wantToRead': {

      }

      default:

    }
    return new Promise(resolve => resolve(true));
  }
}

const dbServices = new DBServices();

export default dbServices;
