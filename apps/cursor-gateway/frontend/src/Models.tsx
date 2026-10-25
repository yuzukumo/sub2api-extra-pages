import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Paper,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  ThemeIcon,
} from "@mantine/core";
import { IconBox, IconSearch } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { api, providerLabel, type Account, type Model } from "./api";
import { useLocale } from "./locale";

export function Models({ account }: { account: Account }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const client = useQueryClient();
  const [editing, setEditing] = useState<Model | null>(null);
  const [contextWindow, setContextWindow] = useState<number | string>("");
  const validContext =
    typeof contextWindow === "number" &&
    Number.isSafeInteger(contextWindow) &&
    contextWindow > 0;
  const save = useMutation({
    mutationFn: (value: number | null) =>
      api<Account>("/models/context", "PUT", {
        model: editing?.id,
        context_window: value,
      }),
    onSuccess: (data) => {
      client.setQueryData(["account"], data);
      setEditing(null);
      notifications.show({
        message: t("上下文设置已保存", "Context settings saved"),
        color: "teal",
      });
    },
    onError: (error) => notifications.show({ message: error.message, color: "red" }),
  });
  const effort = useMutation({
    mutationFn: ({ model, value }: { model: string; value: string | null }) =>
      api<Account>("/models/effort", "PUT", { model, effort: value }),
    onSuccess: (data) => {
      client.setQueryData(["account"], data);
      notifications.show({
        message: t("注入等级已保存", "Effort setting saved"),
        color: "teal",
      });
    },
    onError: (error) => notifications.show({ message: error.message, color: "red" }),
  });
  const models = account.models.filter((model) =>
    `${model.id} ${providerLabel(model.provider)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>{t("可用模型", "Available models")}</Title>
        <Text c="dimmed" size="sm" mt={6}>
          {t(
            "你已选 key 提供的全部模型，思考等级由网关自动读取",
            "All models available through your selected keys, with reasoning levels read automatically",
          )}
        </Text>
      </div>
      <Paper p={0} bg="var(--gateway-surface)" style={{ overflow: "hidden" }}>
        <Group justify="space-between" p="lg">
          <Group gap="sm">
            <Text fw={600}>{t("模型列表", "Model list")}</Text>
            <Badge variant="light">{account.models.length}</Badge>
          </Group>
          <TextInput
            size="sm"
            placeholder={t("搜索模型", "Search models")}
            aria-label={t("搜索模型", "Search models")}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
          />
        </Group>
        <Table.ScrollContainer minWidth={800}>
          <Table horizontalSpacing="lg" verticalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("模型", "Model")}</Table.Th>
                <Table.Th>{t("服务", "Provider")}</Table.Th>
                <Table.Th>{t("思考等级", "Reasoning levels")}</Table.Th>
                <Table.Th>{t("注入等级", "Injected effort")}</Table.Th>
                <Table.Th>{t("上下文", "Context window")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {models.map((model) => (
                <Table.Tr key={model.id}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon
                        variant="light"
                        color={
                          model.provider === "sub-claude"
                            ? "orange"
                            : model.provider === "sub-grok"
                              ? "gray"
                              : "teal"
                        }
                        radius="md"
                        size={36}
                      >
                        <IconBox size={18} />
                      </ThemeIcon>
                      <div>
                        <Text fw={500} size="sm">
                          {model.id}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {t("可用", "Available")}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color="gray" variant="light">
                      {providerLabel(model.provider)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {model.efforts?.length ? (
                        model.efforts.map((effort) => (
                          <Badge
                            key={effort}
                            size="sm"
                            variant="light"
                            color="gray"
                          >
                            {effort}
                          </Badge>
                        ))
                      ) : (
                        <Text size="sm" c="dimmed">
                          {t("默认", "Default")}
                        </Text>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      {model.effort_source === "models.dev"
                        ? "models.dev"
                        : t("默认三级", "Default levels")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      aria-label={t(
                        `${model.id} 注入等级`,
                        `Injected effort for ${model.id}`,
                      )}
                      size="xs"
                      w={180}
                      placeholder="-"
                      allowDeselect={false}
                      disabled={
                        !model.is_openai ||
                        model.efforts.length === 0 ||
                        effort.isPending
                      }
                      value={
                        !model.is_openai || model.efforts.length === 0
                          ? null
                          : model.effort_override === undefined
                            ? "__default__"
                            : model.effort_override === ""
                              ? "__off__"
                              : model.effort_override
                      }
                      data={
                        model.is_openai && model.efforts.length > 0
                          ? [
                              {
                                value: "__default__",
                                label: t(
                                  `默认（${model.efforts.includes("xhigh") ? "xhigh" : "不注入"}）`,
                                  `Default (${model.efforts.includes("xhigh") ? "xhigh" : "No injection"})`,
                                ),
                              },
                              {
                                value: "__off__",
                                label: t("不注入", "No injection"),
                              },
                              ...model.efforts.map((value) => ({
                                value,
                                label: value,
                              })),
                            ]
                          : []
                      }
                      onChange={(value) => {
                        if (value !== null)
                          effort.mutate({
                            model: model.id,
                            value:
                              value === "__default__"
                                ? null
                                : value === "__off__"
                                  ? ""
                                  : value,
                          });
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Stack gap={2}>
                        <Text size="sm" c="dimmed">
                          {model.context_window
                            ? model.context_window.toLocaleString()
                            : "-"}
                        </Text>
                        {model.context_window_override && (
                          <Text size="xs" c="teal">
                            {t("自定义", "Custom")}
                          </Text>
                        )}
                      </Stack>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        aria-label={t(
                          `修改 ${model.id} 上下文`,
                          `Edit context for ${model.id}`,
                        )}
                        onClick={() => {
                          setEditing(model);
                          setContextWindow(model.context_window || "");
                          save.reset();
                        }}
                      >
                        {t("修改", "Edit")}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!models.length && (
          <Stack p={48} align="center" gap="sm">
            <IconBox size={36} color="var(--mantine-color-dimmed)" />
            <Text fw={500}>{t("暂无可用模型", "No models available")}</Text>
            <Text c="dimmed" size="sm" ta="center">
              {t(
                "请在 Key 选择中勾选可用的 key 并同步",
                "Select active keys in Key selection and sync them",
              )}
            </Text>
          </Stack>
        )}
      </Paper>
      <Modal
        opened={editing !== null}
        onClose={() => {
          if (!save.isPending) setEditing(null);
        }}
        title={t("自定义上下文", "Custom context window")}
        centered
      >
        <Stack>
          <Text size="sm" fw={500}>
            {editing?.id}
          </Text>
          <Text size="sm" c="dimmed">
            {t(
              "设置仅对你的账号生效，Cursor 重新读取模型列表后更新。模型连续 14 天未出现时清理。",
              "This setting applies only to your account and updates when Cursor reloads the model list. It is removed after the model is absent for 14 consecutive days.",
            )}
          </Text>
          <NumberInput
            label={t("上下文 token 数", "Context tokens")}
            value={contextWindow}
            onChange={setContextWindow}
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            allowDecimal={false}
            allowNegative={false}
            thousandSeparator=","
            disabled={save.isPending}
          />
          <Group justify="space-between">
            <Button
              variant="subtle"
              disabled={!editing?.context_window_override || save.isPending}
              onClick={() => save.mutate(null)}
            >
              {t("恢复默认", "Restore default")}
            </Button>
            <Group gap="sm">
              <Button
                variant="default"
                disabled={save.isPending}
                onClick={() => setEditing(null)}
              >
                {t("取消", "Cancel")}
              </Button>
              <Button
                loading={save.isPending}
                disabled={!validContext}
                onClick={() => {
                  if (typeof contextWindow === "number")
                    save.mutate(contextWindow);
                }}
              >
                {t("保存", "Save")}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
