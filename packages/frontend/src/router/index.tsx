import { createBrowserRouter, redirect } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage.js';
import { OAuthCallbackPage } from '../pages/OAuthCallbackPage.js';
import { PrototypeV2Page } from '../pages/PrototypeV2Page.js';

export const router = createBrowserRouter([
  { path: '/', element: <PrototypeV2Page /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/oauth/callback', element: <OAuthCallbackPage /> },
  { path: '*', loader: () => redirect('/') },
]);
