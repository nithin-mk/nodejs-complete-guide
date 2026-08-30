import { Request, Response, NextFunction } from 'express';

export const get404 = (req: Request, res: Response, next: NextFunction): void => {
  res.status(404).render('404', {
    pageTitle: 'Page Not Found',
    path: '/404',
    isAuthenticated: Boolean(req.session && req.session.isLoggedIn),
    csrfToken: res.locals.csrfToken || ''
  });
};

export const get500 = (req: Request, res: Response, next: NextFunction): void => {
  res.status(500).render('500', {
    pageTitle: 'Error!',
    path: '/500',
    isAuthenticated: Boolean(req.session && req.session.isLoggedIn),
    csrfToken: res.locals.csrfToken || ''
  });
};
