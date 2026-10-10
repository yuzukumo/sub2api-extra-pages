import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { LocaleProvider } from "./locale";
import { cssVariablesResolver, theme } from "./theme";

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
    >
      <Notifications position="top-right" />
      <LocaleProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LocaleProvider>
    </MantineProvider>
  </QueryClientProvider>,
);
