import { Router } from 'https://deno.land/x/oak@v8.0.0/mod.ts';
import { Bson } from 'https://deno.land/x/mongo@v0.25.0/mod.ts';

import { getDb } from '../helpers/db_client.ts';

const router = new Router();

interface Todo {
  id?: string;
  text: string;
}

interface TodoSchema {
  _id: { $oid: string };
  text: string;
}

type RequestBody = {
  text: string;
};

let todos: Todo[] = [];

router.get('/todos', async (ctx) => {
  const todos = getDb().collection<TodoSchema>('todos').find({}, { noCursorTimeout: false}); // { _id: ObjectId(), text: '...' }[]
  const transformedTodos = await todos.map(
    (todo) => {
      return { id: new Bson.ObjectId(todo._id).toHexString(), text: todo.text } as Todo;
    }
  );
  ctx.response.body = { todos: transformedTodos };
});

router.post('/todos', async (ctx) => {
  const data = await ctx.request.body().value as RequestBody;
  const newTodo: Todo = {
    // id: new Date().toISOString(),
    text: data.text,
  };

  const id = await getDb().collection<TodoSchema>('todos').insertOne(newTodo);

  newTodo.id = id.$oid;

  ctx.response.body = { message: 'Created todo!', todo: newTodo };
});

router.put('/todos/:todoId', async (ctx) => {
  const tid = ctx.params.todoId!;
  const data = await ctx.request.body().value as RequestBody;
  const todoIndex = todos.findIndex((todo) => {
    return todo.id === tid;
  });
  todos[todoIndex] = { id: todos[todoIndex].id, text: data.text };
  ctx.response.body = { message: 'Updated todo' };
});

router.delete('/todos/:todoId', (ctx) => {
  const tid = ctx.params.todoId!;
  todos = todos.filter((todo) => todo.id !== tid);
  ctx.response.body = { message: 'Deleted todo' };
});

export default router;
