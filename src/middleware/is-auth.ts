import { Request, Response, NextFunction } from 'express';

const isAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.session.isLoggedIn) {
    res.redirect('/login');
    return;
  }
  next();
};

export default isAuth;
