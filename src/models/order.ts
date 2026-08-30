import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderProduct {
  product: object;
  quantity: number;
}

export interface IOrder extends Document {
  products: IOrderProduct[];
  user: {
    email: string;
    userId: any;
  };
}

const orderSchema = new Schema({
  products: [
    {
      product: { type: Object, required: true },
      quantity: { type: Number, required: true }
    }
  ],
  user: {
    email: {
      type: String,
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    }
  }
});

export default mongoose.model<IOrder>('Order', orderSchema);
