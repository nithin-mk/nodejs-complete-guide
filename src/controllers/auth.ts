import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import sendgridTransport from 'nodemailer-sendgrid-transport';
import { validationResult } from 'express-validator/check';

import User from '../models/user';

const transporter = nodemailer.createTransport(
  sendgridTransport({
    auth: {
      api_key: process.env.SENDGRID_API_KEY || ''
    }
  })
);

export const getLogin = (req: Request, res: Response, next: NextFunction): void => {
  const message: string | null = (req.flash('error') as string[])[0] || null;
  res.render('auth/login', {
    path: '/login',
    pageTitle: 'Login',
    errorMessage: message,
    oldInput: { email: '', password: '' },
    validationErrors: []
  });
};

export const getSignup = (req: Request, res: Response, next: NextFunction): void => {
  const message: string | null = (req.flash('error') as string[])[0] || null;
  res.render('auth/signup', {
    path: '/signup',
    pageTitle: 'Signup',
    errorMessage: message,
    oldInput: { email: '', password: '', confirmPassword: '' },
    validationErrors: []
  });
};

export const postLogin = (req: Request, res: Response, next: NextFunction): void => {
  const email: string = req.body.email;
  const password: string = req.body.password;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).render('auth/login', {
      path: '/login',
      pageTitle: 'Login',
      errorMessage: (errors.array()[0] as any).msg,
      oldInput: { email, password },
      validationErrors: errors.array()
    });
    return;
  }

  User.findOne({ email })
    .then(user => {
      if (!user) {
        res.status(422).render('auth/login', {
          path: '/login',
          pageTitle: 'Login',
          errorMessage: 'Invalid email or password.',
          oldInput: { email, password },
          validationErrors: []
        });
        return;
      }
      bcrypt
        .compare(password, user.password)
        .then(doMatch => {
          if (doMatch) {
            req.session.isLoggedIn = true;
            req.session.user = user;
            req.session.save(err => {
              if (err) console.log(err);
              res.redirect('/');
            });
            return;
          }
          res.status(422).render('auth/login', {
            path: '/login',
            pageTitle: 'Login',
            errorMessage: 'Invalid email or password.',
            oldInput: { email, password },
            validationErrors: []
          });
        })
        .catch(err => {
          console.log(err);
          res.redirect('/login');
        });
    })
    .catch(err => next(err));
};

export const postSignup = (req: Request, res: Response, next: NextFunction): void => {
  const email: string = req.body.email;
  const password: string = req.body.password;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(errors.array());
    res.status(422).render('auth/signup', {
      path: '/signup',
      pageTitle: 'Signup',
      errorMessage: (errors.array()[0] as any).msg,
      oldInput: { email, password, confirmPassword: req.body.confirmPassword },
      validationErrors: errors.array()
    });
    return;
  }

  bcrypt
    .hash(password, 12)
    .then(hashedPassword => {
      const user = new User({
        email,
        password: hashedPassword,
        cart: { items: [] }
      });
      return user.save();
    })
    .then(() => {
      res.redirect('/login');
    })
    .catch(err => next(err));
};

export const postLogout = (req: Request, res: Response, next: NextFunction): void => {
  req.session.destroy(err => {
    if (err) console.log(err);
    res.redirect('/');
  });
};

export const getReset = (req: Request, res: Response, next: NextFunction): void => {
  const message: string | null = (req.flash('error') as string[])[0] || null;
  res.render('auth/reset', {
    path: '/reset',
    pageTitle: 'Reset Password',
    errorMessage: message
  });
};

export const postReset = (req: Request, res: Response, next: NextFunction): void => {
  crypto.randomBytes(32, (err, buffer) => {
    if (err) {
      console.log(err);
      res.redirect('/reset');
      return;
    }
    const token = buffer.toString('hex');
    User.findOne({ email: req.body.email })
      .then(user => {
        if (!user) {
          req.flash('error', 'No account with that email found.');
          res.redirect('/reset');
          return;
        }
        user.resetToken = token;
        user.resetTokenExpiration = new Date(Date.now() + 3_600_000);
        return user.save();
      })
      .then(() => {
        res.redirect('/');
        transporter.sendMail({
          to: req.body.email,
          from: 'nithinmkurien@gmail.com',
          subject: 'Password reset',
          html: `
            <p>You requested a password reset</p>
            <p>Click this <a href="http://localhost:3000/reset/${token}">link</a> to set a new password.</p>
          `
        });
      })
      .catch(err => next(err));
  });
};

export const getNewPassword = (req: Request, res: Response, next: NextFunction): void => {
  const token: string = req.params.token;
  User.findOne({ resetToken: token, resetTokenExpiration: { $gt: new Date() as any } })
    .then(user => {
      if (!user) {
        return next(new Error('Invalid or expired reset token.'));
      }
      const message: string | null = (req.flash('error') as string[])[0] || null;
      res.render('auth/new-password', {
        path: '/new-password',
        pageTitle: 'New Password',
        errorMessage: message,
        userId: user._id.toString(),
        passwordToken: token
      });
    })
    .catch(err => next(err));
};

export const postNewPassword = (req: Request, res: Response, next: NextFunction): void => {
  const newPassword: string = req.body.password;
  const userId: string = req.body.userId;
  const passwordToken: string = req.body.passwordToken;
  let resetUser: any;

  User.findOne({
    resetToken: passwordToken,
    resetTokenExpiration: { $gt: new Date() as any },
    _id: userId
  })
    .then(user => {
      resetUser = user;
      return bcrypt.hash(newPassword, 12);
    })
    .then(hashedPassword => {
      resetUser.password = hashedPassword;
      resetUser.resetToken = undefined;
      resetUser.resetTokenExpiration = undefined;
      return resetUser.save();
    })
    .then(() => {
      res.redirect('/login');
    })
    .catch(err => next(err));
};
