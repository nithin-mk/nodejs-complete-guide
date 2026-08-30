import { Document } from 'mongoose';

export interface ICartItem {
  productId: any;
  quantity: number;
}

export interface IUser extends Document {
  email: string;
  password: string;
  resetToken?: string;
  resetTokenExpiration?: Date;
  cart: { items: ICartItem[] };
  addToCart(product: any): Promise<IUser>;
  removeFromCart(productId: string): Promise<IUser>;
  clearCart(): Promise<IUser>;
  populate(path: string): this;
  execPopulate(): Promise<this>;
}

declare global {
  namespace Express {
    interface Request {
      user: IUser;
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    isLoggedIn: boolean;
    user: any;  // loose — Mongoose doc stored in session
  }
}
