import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  IconArrowRight,
  IconBox,
  IconKey,
  IconPlugConnected,
  IconRefresh,
  IconShieldCheck,
  IconWallet,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api, type Account } from "./api";
import { CopyValue } from "./components";
import { useLocale } from "./locale";

export function Dashboard({ account }: { account: Account }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const [rotateOpened, setRotateOpened] = useState(false);
  const sync = useMutation({
    mutationFn: () =>
      api<Account>("/sync", "POST", {
        key_ids: account.selected_source_ids ?? [],
      }),
    onSuccess: (data) => {
      client.setQueryData(["account"], data);
      notifications.show({
        message: t("已同步模型和 key", "Keys and models synced"),
        color: "teal",
      });
    },
    onError: (error) =>
      notifications.show({ message: error.message, color: "red" }),
  });
  const rotate = useMutation({
    mutationFn: () => api<Account>("/key/rotate", "POST", {}),
    onSuccess: (data) => {
      client.setQueryData(["account"], data);
      setRotateOpened(false);
      notifications.show({
        message: t(
          "新 key 已生成，请更新 Cursor 配置",
          "New key generated. Update your Cursor settings",
        ),
        color: "teal",
      });
    },
    onError: (error) =>
      notifications.show({ message: error.message, color: "red" }),
  });
  const stats = [
    {
      label: t("可用模型", "Available models"),
      value: account.models.length,
      icon: IconBox,
      color: "teal",
    },
    {
      label: t("已聚合 key", "Selected keys"),
      value: account.bindings.length,
      icon: IconKey,
      color: "blue",
    },
    {
      label: t("接入服务", "Providers"),
      value: new Set(account.bindings.map((binding) => binding.provider)).size,
      icon: IconPlugConnected,
      color: "violet",
    },
    {
      label: t("账户余额", "Account balance"),
      value: `$${account.user.balance.toFixed(2)}`,
      icon: IconWallet,
      color: "orange",
    },
  ];
  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{t("概览", "Overview")}</Title>
          <Text c="dimmed" size="sm" mt={6}>
            {t(
              "管理你的 Cursor 接入，一处使用所有已选模型",
              "Manage your Cursor connection and use all your selected models",
            )}
          </Text>
        </div>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          loading={sync.isPending}
          onClick={() => sync.mutate()}
        >
          {t("同步", "Sync")}
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="lg">
        {stats.map((stat) => (
          <Paper key={stat.label} bg="var(--gateway-surface)">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="sm" c="dimmed">
                  {stat.label}
                </Text>
                <Text size="28px" fw={650} mt="xs">
                  {stat.value}
                </Text>
              </div>
              <ThemeIcon
                variant="light"
                color={stat.color}
                size={44}
                radius="md"
              >
                <stat.icon size={23} stroke={1.6} />
              </ThemeIcon>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      {!account.bindings.length && (
        <Alert
          color="teal"
          icon={<IconKey size={20} />}
          title={t("先选择要聚合的 key", "Choose your keys first")}
        >
          <Text size="sm">
            {t(
              "从已有的 Sub2API key 中选择要给 Cursor 使用的 key",
              "Select the existing Sub2API keys you want to use in Cursor",
            )}
          </Text>
          <Button
            component={Link}
            to="/keys"
            mt="md"
            size="sm"
            rightSection={<IconArrowRight size={16} />}
          >
            {t("选择 key", "Select keys")}
          </Button>
        </Alert>
      )}
      <Paper bg="var(--gateway-surface)">
        <Group justify="space-between" mb="lg">
          <div>
            <Title order={4}>{t("连接 Cursor", "Connect Cursor")}</Title>
            <Text size="sm" c="dimmed" mt={4}>
              {t(
                "在 Cursor 的 Models > Gateway 中填入以下地址和 key，即可使用全部已选模型",
                "Enter this URL and key in Cursor's Models > Gateway settings to access all selected models",
              )}
            </Text>
          </div>
          <Badge variant="light" leftSection={<IconShieldCheck size={13} />}>
            {t("原分组计费", "Original group billing")}
          </Badge>
        </Group>
        <Stack gap="lg">
          <Group align="flex-end" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              label="Base URL"
              value={account.base_url}
              readOnly
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)" },
              }}
            />
            <CopyValue value={account.base_url} />
          </Group>
          {account.key && account.bindings.length ? (
            <Group align="flex-end" wrap="nowrap">
              <PasswordInput
                style={{ flex: 1 }}
                label="API Key"
                value={account.key}
                readOnly
                styles={{
                  input: { fontFamily: "var(--mantine-font-family-monospace)" },
                }}
                visibilityToggleButtonProps={{
                  "aria-label": t("显示或隐藏 key", "Show or hide key"),
                }}
              />
              <CopyValue value={account.key} />
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              {t(
                "保存 key 选择后，会在这里显示聚合 key",
                "Your aggregate key will appear here after you save your selection",
              )}
            </Text>
          )}
          <Divider />
          <Stack gap="sm">
            <Text size="sm">
              {t(
                "1. 打开 Cursor Settings 中的 Models > Gateway",
                "1. Open Models > Gateway in Cursor Settings",
              )}
            </Text>
            <Text size="sm">
              {t(
                "2. 填入上方的 Base URL 和 API Key",
                "2. Enter the Base URL and API Key shown above",
              )}
            </Text>
            <Text size="sm">
              {t(
                "3. 使用网关提供的模型列表，选择模型开始对话",
                "3. Use the model list from the gateway and start a conversation",
              )}
            </Text>
          </Stack>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {t("最后同步", "Last synced")}{" "}
              {new Date(account.synced_at).toLocaleString()}
            </Text>
            {account.key && (
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => setRotateOpened(true)}
              >
                {t("重新生成 key", "Regenerate key")}
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper bg="var(--gateway-surface)">
          <Group gap="sm" mb="sm">
            <ThemeIcon variant="light" radius="md">
              <IconKey size={18} />
            </ThemeIcon>
            <Title order={5}>
              {t("自由选择，统一接入", "Choose keys, connect once")}
            </Title>
          </Group>
          <Text size="sm" c="dimmed">
            {t(
              "随时调整要聚合的 key。每次调用继续使用对应的原 key、分组倍率和账户余额",
              "Change your key selection anytime. Each request uses its original key, group multiplier and account balance",
            )}
          </Text>
          <Button
            component={Link}
            to="/keys"
            variant="subtle"
            mt="sm"
            p={0}
            rightSection={<IconArrowRight size={15} />}
          >
            {t("管理 key 选择", "Manage key selection")}
          </Button>
        </Paper>
        <Paper bg="var(--gateway-surface)">
          <Group gap="sm" mb="sm">
            <ThemeIcon color="blue" variant="light" radius="md">
              <IconBox size={18} />
            </ThemeIcon>
            <Title order={5}>
              {t("模型和思考等级", "Models and reasoning levels")}
            </Title>
          </Group>
          <Text size="sm" c="dimmed">
            {t(
              "模型来自你勾选的 key，思考等级自动读取 models.dev，无需手动配置",
              "Models come from your selected keys. Reasoning levels are read from models.dev automatically",
            )}
          </Text>
          <Button
            component={Link}
            to="/catalog"
            variant="subtle"
            mt="sm"
            p={0}
            rightSection={<IconArrowRight size={15} />}
          >
            {t("查看可用模型", "View available models")}
          </Button>
        </Paper>
      </SimpleGrid>
      <Modal
        opened={rotateOpened}
        onClose={() => setRotateOpened(false)}
        title={t("重新生成聚合 key", "Regenerate aggregate key")}
        centered
      >
        <Stack>
          <Text size="sm">
            {t(
              "旧 key 将立即失效。生成后需要更新 Cursor 的 Models > Gateway 中的 API Key",
              "Your old key will stop working immediately. Update the API Key in Cursor's Models > Gateway settings after regeneration",
            )}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRotateOpened(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              color="red"
              loading={rotate.isPending}
              onClick={() => rotate.mutate()}
            >
              {t("重新生成", "Regenerate")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
