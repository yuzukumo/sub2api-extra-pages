import { useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  PasswordInput,
  PinInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { IconAlertCircle, IconLock, IconMail } from "@tabler/icons-react";
import {
  api,
  type Account,
  type LoginInput,
  type PublicSettings,
  type TwoFactor,
} from "./api";
import { Brand, Preferences } from "./components";
import { useLocale } from "./locale";

interface TencentResult {
  ret: number;
  ticket: string;
  randstr: string;
}
interface TencentCaptcha {
  show(): void;
}
type TencentConstructor = new (
  id: string,
  callback: (result: TencentResult) => void,
) => TencentCaptcha;
let tencentScript: Promise<void> | undefined;

function loadTencent(): Promise<void> {
  tencentScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://turing.captcha.qcloud.com/TCaptcha.js";
    script.onload = () => resolve();
    script.onerror = () => {
      tencentScript = undefined;
      reject(new Error("Unable to load captcha"));
    };
    document.head.appendChild(script);
  });
  return tencentScript;
}

export function Login() {
  const { t } = useLocale();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["public"],
    queryFn: () => api<PublicSettings>("/public"),
  });
  const [tempToken, setTempToken] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const turnstile = useRef<TurnstileInstance>(null);
  const form = useForm({
    initialValues: { email: "", password: "" },
    validate: {
      email: (value) =>
        /^\S+@\S+\.\S+$/.test(value)
          ? null
          : t("请输入有效邮箱", "Enter a valid email"),
      password: (value) =>
        value ? null : t("请输入密码", "Enter your password"),
    },
  });
  const login = useMutation({
    mutationFn: (body: LoginInput) =>
      api<Account | TwoFactor>("/login", "POST", body),
    onSuccess: (data) => {
      form.setFieldValue("password", "");
      if ("requires_2fa" in data) {
        setTempToken(data.temp_token);
        return;
      }
      client.setQueryData(["account"], data);
    },
    onError: () => {
      turnstile.current?.reset();
      setCaptcha("");
    },
  });
  async function submit(values: typeof form.values) {
    setCaptchaError("");
    if (settings.data?.tencent_captcha_enabled) {
      setCaptchaLoading(true);
      try {
        await loadTencent();
        const Captcha = (
          window as Window & { TencentCaptcha?: TencentConstructor }
        ).TencentCaptcha;
        if (!Captcha) throw new Error("Unable to load captcha");
        new Captcha(settings.data.tencent_captcha_app_id, (result) => {
          setCaptchaLoading(false);
          if (result.ret === 0)
            login.mutate({
              ...values,
              tencent_captcha_ticket: result.ticket,
              tencent_captcha_randstr: result.randstr,
              turnstile_token: captcha,
            });
        }).show();
      } catch {
        setCaptchaLoading(false);
        setCaptchaError(
          t(
            "验证码加载失败，请重试",
            "Captcha could not load. Please try again",
          ),
        );
      }
      return;
    }
    login.mutate({ ...values, turnstile_token: captcha });
  }
  return (
    <Box
      mih="100dvh"
      style={{
        background:
          "radial-gradient(ellipse at top left, light-dark(#ccfbf180, #134e4a40), transparent 60%), var(--gateway-canvas)",
      }}
    >
      <Group justify="flex-end" p="lg">
        <Preferences />
      </Group>
      <Container size={448} pt={{ base: 24, sm: 64 }} pb="xl">
        <Stack gap="xl">
          <Center>
            <Brand />
          </Center>
          <div>
            <Title order={2} ta="center">
              {t("欢迎回来", "Welcome back")}
            </Title>
            <Text ta="center" c="dimmed" mt="xs" size="sm">
              {t(
                "使用 Sub2API 账号登录，连接你的 Cursor",
                "Sign in with your Sub2API account to connect Cursor",
              )}
            </Text>
          </div>
          <Paper p="xl" shadow="sm" bg="var(--gateway-surface)">
            {settings.isPending ? (
              <Center p="xl">
                <Loader />
              </Center>
            ) : settings.isError ? (
              <Alert
                color="red"
                icon={<IconAlertCircle size={18} />}
                title={t("暂时无法连接", "Unable to connect")}
              >
                <Text size="sm">
                  {t(
                    "请确认 Sub2API 服务已启动",
                    "Make sure Sub2API is running",
                  )}
                </Text>
                <Button
                  mt="sm"
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={() => void settings.refetch()}
                >
                  {t("重试", "Retry")}
                </Button>
              </Alert>
            ) : (
              <Stack gap="lg">
                {(login.isError || captchaError) && (
                  <Alert color="red" icon={<IconAlertCircle size={18} />}>
                    {captchaError || login.error?.message}
                  </Alert>
                )}
                {settings.data?.aliyun_captcha_enabled && (
                  <Alert color="yellow">
                    {t(
                      "当前站点启用了阿里云验证码，网关尚未支持该验证方式，请联系管理员",
                      "This site uses Aliyun captcha, which is not supported yet. Contact your administrator",
                    )}
                  </Alert>
                )}
                {tempToken ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      login.mutate({ temp_token: tempToken, totp_code: code });
                    }}
                  >
                    <Stack gap="lg">
                      <Text size="sm" ta="center">
                        {t(
                          "请输入身份验证器中的六位验证码",
                          "Enter the six-digit code from your authenticator",
                        )}
                      </Text>
                      <Center>
                        <PinInput
                          length={6}
                          type="number"
                          value={code}
                          onChange={setCode}
                          aria-label={t("两步验证码", "Two-factor code")}
                          oneTimeCode
                        />
                      </Center>
                      <Button
                        type="submit"
                        fullWidth
                        size="md"
                        loading={login.isPending}
                        disabled={code.length !== 6}
                      >
                        {t("验证并登录", "Verify and sign in")}
                      </Button>
                      <Anchor
                        ta="center"
                        size="sm"
                        onClick={() => {
                          setTempToken("");
                          login.reset();
                        }}
                      >
                        {t("返回登录", "Back to sign in")}
                      </Anchor>
                    </Stack>
                  </form>
                ) : (
                  <form
                    onSubmit={form.onSubmit((values) => void submit(values))}
                  >
                    <Stack gap="lg">
                      <TextInput
                        label={t("邮箱", "Email")}
                        placeholder="you@example.com"
                        type="email"
                        autoComplete="username"
                        leftSection={<IconMail size={18} />}
                        {...form.getInputProps("email")}
                      />
                      <PasswordInput
                        label={t("密码", "Password")}
                        placeholder={t("输入你的密码", "Enter your password")}
                        autoComplete="current-password"
                        leftSection={<IconLock size={18} />}
                        {...form.getInputProps("password")}
                      />
                      {settings.data?.turnstile_enabled && (
                        <Center>
                          <Turnstile
                            ref={turnstile}
                            siteKey={settings.data.turnstile_site_key}
                            onSuccess={setCaptcha}
                            onExpire={() => setCaptcha("")}
                            onError={() =>
                              setCaptchaError(
                                t("验证码加载失败", "Captcha could not load"),
                              )
                            }
                            options={{ theme: "auto" }}
                          />
                        </Center>
                      )}
                      <Button
                        type="submit"
                        fullWidth
                        size="md"
                        loading={login.isPending || captchaLoading}
                        disabled={
                          settings.data?.aliyun_captcha_enabled ||
                          (settings.data?.turnstile_enabled && !captcha)
                        }
                      >
                        {t("登录", "Sign in")}
                      </Button>
                    </Stack>
                  </form>
                )}
              </Stack>
            )}
          </Paper>
          <Text size="xs" c="dimmed" ta="center">
            {t(
              "模型调用继续使用原有 Sub2API 分组计费",
              "Model requests keep your original Sub2API group billing",
            )}
          </Text>
        </Stack>
      </Container>
    </Box>
  );
}
