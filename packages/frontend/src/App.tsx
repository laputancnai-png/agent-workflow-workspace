import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import './i18n/index.js';
import { ToastContainer } from './components/ui/Toast.js';
import { queryClient } from './lib/query-client.js';
import { router } from './router/index.js';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastContainer />
    </QueryClientProvider>
  );
}
