import {
  createTheme,
  type CSSVariablesResolver,
  Paper,
  NavLink,
  Button,
  TextInput,
  PasswordInput,
  Select,
} from "@mantine/core";

export const theme = createTheme({
  primaryColor: "teal",
  primaryShade: { light: 6, dark: 4 },
  colors: {
    teal: [
      "#f0fdfa",
      "#ccfbf1",
      "#99f6e4",
      "#5eead4",
      "#2dd4bf",
      "#14b8a6",
      "#0d9488",
      "#0f766e",
      "#115e59",
      "#134e4a",
    ],
    gray: [
      "#f8fafc",
      "#f1f5f9",
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#334155",
      "#1e293b",
      "#0f172a",
    ],
    dark: [
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#334155",
      "#1e293b",
      "#182234",
      "#0f172a",
      "#0b1220",
      "#020617",
    ],
  },
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  defaultRadius: "md",
  radius: { xs: "6px", sm: "8px", md: "12px", lg: "16px", xl: "24px" },
  headings: { fontWeight: "600" },
  shadows: {
    xs: "0 1px 3px rgb(15 23 42 / 0.04)",
    sm: "0 4px 20px rgb(15 23 42 / 0.05)",
  },
  components: {
    Paper: Paper.extend({
      defaultProps: { withBorder: true, radius: "lg", p: "lg", shadow: "xs" },
    }),
    NavLink: NavLink.extend({
      defaultProps: { variant: "light" },
      styles: { root: { borderRadius: "12px", padding: "12px" } },
    }),
    Button: Button.extend({ defaultProps: { fw: 500 } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { size: "md" } }),
    Select: Select.extend({ defaultProps: { size: "md" } }),
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--gateway-canvas": "#f8fafc",
    "--gateway-surface": "#ffffff",
    "--gateway-header": "rgb(255 255 255 / 0.9)",
    "--mantine-color-body": "#f8fafc",
    "--mantine-color-text": "#1e293b",
    "--mantine-color-dimmed": "#64748b",
  },
  dark: {
    "--gateway-canvas": "#0b1220",
    "--gateway-surface": "#0f172a",
    "--gateway-header": "rgb(15 23 42 / 0.9)",
    "--mantine-color-body": "#0b1220",
    "--mantine-color-text": "#e2e8f0",
  },
});
