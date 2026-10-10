import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

test("temporary account failure offers retry and does not show sign-in", async () => {
  const fetch = vi.fn(async () => new Response(
    JSON.stringify({ error: { code: "upstream_unavailable", message: "Sub2API unavailable" } }),
    { status: 502 },
  ));
  vi.stubGlobal("fetch", fetch);
  renderApp();
  await screen.findByText("暂时无法加载账号");
  expect(screen.queryByLabelText("邮箱")).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(new Response(
    JSON.stringify({ error: { code: "upstream_unavailable", message: "Retry failed" } }),
    { status: 502 },
  ));
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("Retry failed");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith("/api/account", expect.any(Object));
});

test("expired account session shows sign-in", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) =>
    String(url) === "/api/account"
      ? new Response(
          JSON.stringify({ error: { code: "unauthorized", message: "Please sign in" } }),
          { status: 401 },
        )
      : new Response(JSON.stringify({ site_name: "Gateway" }), { status: 200 }),
  ));
  renderApp();
  expect(await screen.findByLabelText("邮箱")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
});
