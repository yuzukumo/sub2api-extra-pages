import {
  AppShell,
  Alert,
  Avatar,
  Center,
  Loader,
  Box,
  Burger,
  Button,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import {
  IconBox,
  IconChevronDown,
  IconKey,
  IconLayoutDashboard,
  IconLogout,
} from "@tabler/icons-react";
import { api, APIError, type Account } from "./api";
import { Brand, Preferences } from "./components";
import { Dashboard } from "./Dashboard";
import { Keys } from "./Keys";
import { Models } from "./Models";
import { Login } from "./Login";
import { useLocale } from "./locale";

function Navigation({ close }: { close: () => void }) {
  const { t } = useLocale();
  const location = useLocation();
  const items = [
    { href: "/", label: t("概览", "Overview"), icon: IconLayoutDashboard },
    { href: "/keys", label: t("Key 选择", "Key selection"), icon: IconKey },
    { href: "/catalog", label: t("可用模型", "Models"), icon: IconBox },
  ];
  return (
    <>
      <Text tt="uppercase" size="xs" fw={650} c="dimmed" px="sm" mb="xs">
        {t("工作区", "Workspace")}
      </Text>
      {items.map((item) => (
        <NavLink
          key={item.href}
          component={Link}
          to={item.href}
          active={location.pathname === item.href}
          label={item.label}
          leftSection={<item.icon size={19} stroke={1.7} />}
          onClick={close}
        />
      ))}
    </>
  );
}

export function App() {
  const { t } = useLocale();
  const client = useQueryClient();
  const account = useQuery({
    queryKey: ["account"],
    queryFn: () => api<Account>("/account"),
    retry: false,
  });
  const [opened, { toggle, close }] = useDisclosure(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => api<{ ok: boolean }>("/logout", "POST", {}),
    onSuccess: () => {
      void client.resetQueries({ queryKey: ["account"] });
      navigate("/");
    },
  });
  if (account.isPending)
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  if (account.isError) {
    if (account.error instanceof APIError && account.error.status === 401)
      return <Login />;
    return (
      <Center h="100dvh" p="lg">
        <Stack maw={480}>
          <Alert color="red" title={t("暂时无法加载账号", "Unable to load account")}>
            {account.error.message}
          </Alert>
          <Button onClick={() => void account.refetch()}>
            {t("重试", "Retry")}
          </Button>
        </Stack>
      </Center>
    );
  }
  const current =
    pathname === "/keys" ? (
      <Keys account={account.data} />
    ) : pathname === "/catalog" ? (
      <Models account={account.data} />
    ) : (
      <Dashboard account={account.data} />
    );
  const initials = (account.data.user.username || account.data.user.email)
    .slice(0, 1)
    .toUpperCase();
  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{ width: 256, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="xl"
    >
      <AppShell.Header
        bg="var(--gateway-header)"
        style={{ backdropFilter: "blur(12px)" }}
      >
        <Group h="100%" px="lg" justify="space-between">
          <Group>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
            />
            <Box hiddenFrom="sm">
              <Brand compact />
            </Box>
            <Text visibleFrom="sm" fw={650} size="lg">
              {pathname === "/keys"
                ? t("Key 选择", "Key selection")
                : pathname === "/catalog"
                  ? t("可用模型", "Models")
                  : t("概览", "Overview")}
            </Text>
          </Group>
          <Group gap="lg">
            <Preferences />
            <Menu position="bottom-end" shadow="md" width={220}>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="sm">
                    <Avatar color="teal" radius="xl" size={34}>
                      {initials}
                    </Avatar>
                    <Box visibleFrom="sm">
                      <Text size="sm" fw={600} lh={1.2}>
                        {account.data.user.username || account.data.user.email}
                      </Text>
                      <Text size="xs" c="dimmed" mt={3}>
                        {account.data.user.email}
                      </Text>
                    </Box>
                    <IconChevronDown
                      size={15}
                      color="var(--mantine-color-dimmed)"
                    />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{account.data.user.email}</Menu.Label>
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  onClick={() => logout.mutate()}
                >
                  {t("退出登录", "Sign out")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md" bg="var(--gateway-surface)">
        <AppShell.Section>
          <Brand />
        </AppShell.Section>
        <AppShell.Section grow component={ScrollArea} mt="xl">
          <Navigation close={close} />
        </AppShell.Section>
        <AppShell.Section>
          <Text size="xs" c="dimmed" ta="center">
            Cursor Gateway
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main bg="var(--gateway-canvas)">
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>{current}</div>
      </AppShell.Main>
    </AppShell>
  );
}
