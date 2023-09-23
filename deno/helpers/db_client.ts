import { MongoClient, Database } from 'https://deno.land/x/mongo@v0.25.0/mod.ts';

let db: Database;

export async function connect() {
  const client = new MongoClient();
  await client.connect(
    'mongodb+srv://maximilian:9u4biljMQc4jjqbe@cluster0.kkn2g.mongodb.net/?retryWrites=true&w=majority&authMechanism=SCRAM-SHA-1'
  );

  db = client.database('todo-app');
}

export function getDb() {
  return db;
}
