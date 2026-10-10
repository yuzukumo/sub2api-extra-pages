import { useState } from "react";
import {
  Badge,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  ThemeIcon,
} from "@mantine/core";
import { IconBox, IconSearch } from "@tabler/icons-react";
import { providerLabel, type Account } from "./api";
import { useLocale } from "./locale";

export function Models({ account }: { account: Account }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
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
        <Table.ScrollContainer minWidth={600}>
          <Table horizontalSpacing="lg" verticalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("模型", "Model")}</Table.Th>
                <Table.Th>{t("服务", "Provider")}</Table.Th>
                <Table.Th>{t("思考等级", "Reasoning levels")}</Table.Th>
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
                    <Text size="sm" c="dimmed">
                      {model.context_window
                        ? model.context_window.toLocaleString()
                        : "-"}
                    </Text>
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
    </Stack>
  );
}
