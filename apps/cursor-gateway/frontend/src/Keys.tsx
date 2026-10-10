import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { IconKey, IconRefresh } from "@tabler/icons-react";
import { api, providerLabel, type Account } from "./api";
import { useLocale } from "./locale";

export function Keys({ account }: { account: Account }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const [selected, setSelected] = useState<number[]>(
    account.selected_source_ids ?? [],
  );
  const savedSelection = (account.selected_source_ids ?? []).join(",");
  useEffect(() => {
    setSelected(savedSelection ? savedSelection.split(",").map(Number) : []);
  }, [account.user.id, savedSelection]);
  const save = useMutation({
    mutationFn: () => api<Account>("/sync", "POST", { key_ids: selected }),
    onSuccess: (data) => {
      client.setQueryData(["account"], data);
      notifications.show({
        message: t("聚合 key 选择已保存", "Key selection saved"),
        color: "teal",
      });
    },
    onError: (error) =>
      notifications.show({ message: error.message, color: "red" }),
  });
  const usable = account.source_keys
    .filter((key) => key.usable)
    .map((key) => key.id);
  const allSelected =
    usable.length > 0 && usable.every((id) => selected.includes(id));
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{t("Key 选择", "Key selection")}</Title>
          <Text c="dimmed" size="sm" mt={6}>
            {t(
              "选择要给 Cursor 使用的 Sub2API key",
              "Choose the Sub2API keys you want to use in Cursor",
            )}
          </Text>
        </div>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          onClick={() =>
            void client.invalidateQueries({ queryKey: ["account"] })
          }
        >
          {t("刷新列表", "Refresh list")}
        </Button>
      </Group>
      <Alert variant="light" color="teal" icon={<IconKey size={18} />}>
        {t(
          "仅勾选的 key 会加入聚合。每个模型仍使用对应原 key 的分组计费，原 key 内容不会发送到浏览器",
          "Only selected keys are included. Each model keeps its original key billing, and original key values stay on the server",
        )}
      </Alert>
      <Paper p={0} bg="var(--gateway-surface)" style={{ overflow: "hidden" }}>
        <Group justify="space-between" px="lg" py="md">
          <Text fw={600}>
            {t("我的 key", "My keys")}{" "}
            <Text component="span" c="dimmed" fw={400}>
              ({account.source_keys.length})
            </Text>
          </Text>
          <Badge variant="light">
            {t("已选", "Selected")} {selected.length}
          </Badge>
        </Group>
        <Table.ScrollContainer minWidth={650}>
          <Table verticalSpacing="md" horizontalSpacing="lg" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={50}>
                  <Checkbox
                    aria-label={t(
                      "选择全部可用 key",
                      "Select all available keys",
                    )}
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={() => setSelected(allSelected ? [] : usable)}
                    disabled={!usable.length || save.isPending}
                  />
                </Table.Th>
                <Table.Th>{t("名称", "Name")}</Table.Th>
                <Table.Th>{t("分组", "Group")}</Table.Th>
                <Table.Th>{t("格式", "Format")}</Table.Th>
                <Table.Th>{t("分组倍率", "Group multiplier")}</Table.Th>
                <Table.Th>{t("状态", "Status")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {account.source_keys.map((key) => (
                <Table.Tr key={key.id}>
                  <Table.Td>
                    <Checkbox
                      aria-label={`${t("选择", "Select")} ${key.name || `#${key.id}`}`}
                      checked={selected.includes(key.id)}
                      disabled={
                        (!key.usable && !selected.includes(key.id)) ||
                        save.isPending
                      }
                      onChange={(event) =>
                        setSelected(
                          event.currentTarget.checked
                            ? [...selected, key.id]
                            : selected.filter((id) => id !== key.id),
                        )
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={500} size="sm">
                      {key.name || `Key #${key.id}`}
                    </Text>
                    <Text size="xs" c="dimmed">
                      #{key.id}
                    </Text>
                  </Table.Td>
                  <Table.Td>{key.group || "-"}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="gray">
                      {providerLabel(key.provider) || "-"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{key.rate_multiplier}x</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={key.usable ? "teal" : "gray"}>
                      {key.usable
                        ? t("可用", "Available")
                        : t("不可用", "Unavailable")}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!account.source_keys.length && (
          <Stack align="center" p="xl">
            <IconKey size={32} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" size="sm">
              {t(
                "还没有 key，请先在 Sub2API 中创建",
                "No keys yet. Create a key in Sub2API first",
              )}
            </Text>
          </Stack>
        )}
        <Group justify="space-between" p="lg">
          <Text size="sm" c="dimmed">
            {t(
              "每个已选 key 的模型名称需要互不重复",
              "Model names across selected keys must be unique",
            )}
          </Text>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t("保存并聚合", "Save selection")}
          </Button>
        </Group>
      </Paper>
    </Stack>
  );
}
