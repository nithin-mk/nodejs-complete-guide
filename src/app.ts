import path from 'path';
import fs from 'fs';

import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import session from 'express-session';
import connectMongoDBSession from 'connect-mongodb-session';
import csrf from 'csurf';
import flash from 'connect-flash';
import multer from 'multer';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import * as errorController from './controllers/error';
import * as shopController from './controllers/shop';
import isAuth from './middleware/is-auth';
import User from './models/user';

const MongoDBStore = connectMongoDBSession(session);

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required.');
}

const app = express();
const store = new MongoDBStore({ uri: MONGODB_URI, collection: 'sessions' });
const csrfProtection = csrf();

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '../images'));
  },
  filename: (_req, file, cb) => {
    cb(null, new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname);
  }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (['image/png', 'image/jpg', 'image/jpeg'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

app.set('view engine', 'ejs');
app.set('views', 'views');

import adminRoutes from './routes/admin';
import shopRoutes from './routes/shop';
import authRoutes from './routes/auth';

const accessLogStream = fs.createWriteStream(path.join(__dirname, '../access.log'), { flags: 'a' });

app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: accessLogStream }));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(multer({ storage: fileStorage, fileFilter }).single('image'));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/images', express.static(path.join(__dirname, '../images')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store
  })
);
app.use(flash());

app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.isAuthenticated = req.session.isLoggedIn;
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return next();
  }
  User.findById(req.session.user._id)
    .then(user => {
      if (!user) return next();
      req.user = user;
      next();
    })
    .catch(err => next(new Error(err)));
});

app.post('/create-order', [isAuth, shopController.postOrder] as any);

app.use(csrfProtection as any);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.csrfToken = (req as any).csrfToken();
  next();
});

app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.use(authRoutes);

app.get('/500', errorController.get500);
app.use(errorController.get404);

app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error(error);
  res.status(500).render('500', {
    pageTitle: 'Error!',
    path: '/500',
    isAuthenticated: Boolean(req.session && req.session.isLoggedIn),
    csrfToken: res.locals.csrfToken || ''
  });
});

(
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  } as any) as unknown as Promise<any>
)
  .then(() => {
    app.listen(process.env.PORT || 3000, () => {
      console.log('Server running on port', process.env.PORT || 3000);
    });
  })
  .catch((err: any) => console.log(err));
