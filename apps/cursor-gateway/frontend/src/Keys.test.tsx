import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Keys } from "./Keys";
import type { Account } from "./api";

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

test("key list refresh preserves draft selection and saved changes reset it", () => {
  const account: Account = {
    user: {
      id: 7,
      email: "user@example.com",
      username: "user",
      role: "user",
      balance: 0,
    },
    key: "gateway-key",
    base_url: "https://gateway.example/v1",
    bindings: [],
    selected_source_ids: [1],
    source_keys: [1, 2].map((id) => ({
      id,
      name: `Key ${id}`,
      group: "OpenAI",
      provider: id === 2 ? "sub-gemini" : "sub-openai",
      status: "active",
      usable: true,
      rate_multiplier: 1,
    })),
    models: [],
    synced_at: "",
  };
  const client = new QueryClient();
  const view = (value: Account) => (
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <Keys account={value} />
      </MantineProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view(account));
  expect(screen.getByText("Gemini")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "选择 Key 2" }));
  rerender(view({
    ...account,
    selected_source_ids: [...(account.selected_source_ids ?? [])],
    source_keys: [...account.source_keys],
  }));
  expect((screen.getByRole("checkbox", { name: "选择 Key 2" }) as HTMLInputElement).checked).toBe(true);
  rerender(view({ ...account, selected_source_ids: [2] }));
  expect((screen.getByRole("checkbox", { name: "选择 Key 1" }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("checkbox", { name: "选择 Key 2" }) as HTMLInputElement).checked).toBe(true);
});
