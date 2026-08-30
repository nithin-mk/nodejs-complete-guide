import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  title: string;
  price: number;
  description: string;
  imageUrl: string;
  userId: any;
}

const productSchema = new Schema({
  title: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
});

export default mongoose.model<IProduct>('Product', productSchema);
