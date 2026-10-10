import {
  ActionIcon,
  Button,
  CopyButton,
  Group,
  Select,
  Text,
  ThemeIcon,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconMoon,
  IconSun,
  IconTerminal2,
} from "@tabler/icons-react";
import { useLocale } from "./locale";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size={compact ? 36 : 48} radius="md">
        <IconTerminal2 size={compact ? 22 : 28} stroke={1.7} />
      </ThemeIcon>
      <div>
        <Text fw={650} size={compact ? "md" : "lg"}>
          Cursor Gateway
        </Text>
        {!compact && (
          <Text size="xs" c="dimmed">
            Powered by Sub2API
          </Text>
        )}
      </div>
    </Group>
  );
}

export function Preferences() {
  const { locale, setLocale, t } = useLocale();
  const colorScheme = useComputedColorScheme("light");
  const { setColorScheme } = useMantineColorScheme();
  return (
    <Group gap="xs" wrap="nowrap">
      <Select
        aria-label={t("语言", "Language")}
        size="xs"
        w={105}
        value={locale}
        onChange={(value) => {
          if (value === "en" || value === "zh-CN") setLocale(value);
        }}
        data={[
          { value: "zh-CN", label: "简体中文" },
          { value: "en", label: "English" },
        ]}
        allowDeselect={false}
      />
      <Tooltip label={t("切换主题", "Toggle theme")}>
        <ActionIcon
          aria-label={t("切换主题", "Toggle theme")}
          variant="subtle"
          color="gray"
          size="lg"
          onClick={() =>
            setColorScheme(colorScheme === "dark" ? "light" : "dark")
          }
        >
          {colorScheme === "dark" ? (
            <IconSun size={20} />
          ) : (
            <IconMoon size={20} />
          )}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

export function CopyValue({ value }: { value: string }) {
  const { t } = useLocale();
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Button
          size="sm"
          variant="light"
          color={copied ? "teal" : "gray"}
          leftSection={
            copied ? <IconCheck size={16} /> : <IconCopy size={16} />
          }
          onClick={copy}
        >
          {copied ? t("已复制", "Copied") : t("复制", "Copy")}
        </Button>
      )}
    </CopyButton>
  );
}
