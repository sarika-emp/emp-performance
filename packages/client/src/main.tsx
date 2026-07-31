import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./styles/globals.css";
import "./lib/i18n";
import { useAuthStore } from "./lib/auth-store";
import { ConfirmDialogProvider } from "@/components/ConfirmDialog";
import { ThemeProvider } from "@/lib/theme";

// Load existing session from localStorage
useAuthStore.getState().loadFromStorage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ConfirmDialogProvider>
            <App />
          </ConfirmDialogProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              className:
                "!bg-white !text-gray-900 dark:!bg-gray-800 dark:!text-gray-100",
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
