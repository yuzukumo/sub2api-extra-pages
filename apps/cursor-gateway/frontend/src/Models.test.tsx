import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Models } from "./Models";
import type { Account } from "./api";

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
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

test("model context edits save to the account and can restore the default", async () => {
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
    source_keys: [],
    selected_source_ids: [],
    synced_at: "",
    models: [
      {
        id: "test-model",
        provider: "sub-openai",
        is_openai: true,
        efforts: ["low", "high"],
        effort_source: "models.dev",
        injected_effort: "",
        context_window: 128000,
      },
    ],
  };
  const saved: Account = {
    ...account,
    models: [
      {
        ...account.models[0],
        context_window: 64000,
        context_window_override: 64000,
      },
    ],
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => saved })
    .mockResolvedValueOnce({ ok: true, json: async () => account });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const view = (value: Account) => (
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <Models account={value} />
      </MantineProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view(account));
  fireEvent.click(screen.getByRole("button", { name: "修改 test-model 上下文" }));
  const input = screen.getByLabelText("上下文 token 数");
  fireEvent.change(input, { target: { value: "" } });
  expect(
    (screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(input, { target: { value: "64000" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(client.getQueryData(["account"])).toEqual(saved));
  expect(fetch.mock.calls[0][0]).toBe("/api/models/context");
  expect(fetch.mock.calls[0][1].method).toBe("PUT");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    model: "test-model",
    context_window: 64000,
  });
  rerender(view(saved));
  expect(screen.getByText("64,000")).toBeTruthy();
  expect(screen.getByText("自定义")).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "修改 test-model 上下文" }));
  fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
  await waitFor(() => expect(client.getQueryData(["account"])).toEqual(account));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    model: "test-model",
    context_window: null,
  });
});

test("effort options come from model metadata and incompatible models stay disabled", async () => {
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
    source_keys: [],
    selected_source_ids: [],
    synced_at: "",
    models: [
      {
        id: "openai-model",
        provider: "sub-openai",
        is_openai: true,
        efforts: ["low", "xhigh", "future-effort"],
        effort_source: "models.dev",
        injected_effort: "xhigh",
        context_window: 128000,
      },
      {
        id: "compatible-model",
        provider: "sub-openai",
        is_openai: false,
        efforts: ["high"],
        effort_source: "models.dev",
        injected_effort: "",
        context_window: 128000,
      },
      {
        id: "image-model",
        provider: "sub-openai",
        is_openai: true,
        efforts: [],
        effort_source: "models.dev",
        injected_effort: "",
        context_window: 0,
      },
    ],
  };
  const changed = (value: string | null): Account => ({
    ...account,
    models: account.models.map((model) =>
      model.id === "openai-model"
        ? {
            ...model,
            injected_effort: value ?? "xhigh",
            effort_override: value ?? undefined,
          }
        : model,
    ),
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => changed("future-effort") })
    .mockResolvedValueOnce({ ok: true, json: async () => changed("") })
    .mockResolvedValueOnce({ ok: true, json: async () => account });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  const view = (value: Account) => (
    <QueryClientProvider client={client}>
      <MantineProvider env="test">
        <Models account={value} />
      </MantineProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view(account));
  for (const model of ["compatible-model", "image-model"]) {
    const disabled = screen.getByRole("combobox", { name: `${model} 注入等级` }) as HTMLInputElement;
    expect(disabled.disabled).toBe(true);
    expect(disabled.value).toBe("");
    fireEvent.click(disabled);
    expect(screen.queryByRole("option")).toBeNull();
  }

  for (const [index, label, value] of [
    [0, "future-effort", "future-effort"],
    [1, "不注入", ""],
    [2, "默认（xhigh）", null],
  ] as const) {
    fireEvent.click(screen.getByRole("combobox", { name: "openai-model 注入等级" }));
    expect(screen.queryByRole("option", { name: "high" })).toBeNull();
    fireEvent.click(await screen.findByRole("option", { name: label }));
    await waitFor(() => expect(client.getQueryData(["account"])).toEqual(changed(value)));
    expect(fetch.mock.calls[index][0]).toBe("/api/models/effort");
    expect(fetch.mock.calls[index][1].method).toBe("PUT");
    expect(JSON.parse(fetch.mock.calls[index][1].body)).toEqual({
      model: "openai-model",
      effort: value,
    });
    rerender(view(changed(value)));
  }
});
