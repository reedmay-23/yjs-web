<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login, register, setAuthTokens, tryExtractTokens } from "@/services/api";
import { setCurrentAccount } from "@/utils/session";
import { getApiErrorMessage } from "@/utils/workspace";
import IconBrandGoogleDrive from "~icons/tabler/brand-google-drive";
import IconMail from "~icons/tabler/mail";
import IconShieldCheck from "~icons/tabler/shield-check";
import IconSparkles from "~icons/tabler/sparkles";

type AuthMode = "login" | "register";

const route = useRoute();
const router = useRouter();
const authMode = ref<AuthMode>("login");
const isSubmittingAuth = ref(false);
const errorMessage = ref("");

const loginForm = ref({
  account: "system",
  password: "system",
});

const registerForm = ref({
  account: "",
  password: "",
});

const switchAuthMode = (mode: AuthMode) => {
  authMode.value = mode;
  errorMessage.value = "";
};

const submitAuth = async () => {
  isSubmittingAuth.value = true;
  errorMessage.value = "";

  const payload =
    authMode.value === "login"
      ? {
          account: loginForm.value.account.trim(),
          password: loginForm.value.password,
        }
      : {
          account: registerForm.value.account.trim(),
          password: registerForm.value.password,
        };

  try {
    if (authMode.value === "register") {
      const registerResponse = await register(payload);
      const tokens = tryExtractTokens(registerResponse) ?? (await login(payload));
      setAuthTokens(tokens);
    } else {
      setAuthTokens(await login(payload));
    }

    setCurrentAccount(payload.account);
    await router.replace(typeof route.query.redirect === "string" ? route.query.redirect : "/documents");
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, authMode.value === "login" ? "登录失败" : "注册失败");
  } finally {
    isSubmittingAuth.value = false;
  }
};
</script>

<template>
  <main class="min-h-screen bg-[#f6f7fb] text-slate-950">
    <section class="grid min-h-screen grid-cols-1 overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
      <div class="relative flex min-h-[360px] flex-col justify-between bg-slate-950 p-8 text-white sm:p-10 lg:min-h-screen">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.34),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(59,130,246,0.26),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,1))]" />
        <div class="relative z-10 flex items-center gap-3">
          <div class="grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-950">
            <IconBrandGoogleDrive class="h-6 w-6" />
          </div>
          <div>
            <p class="text-lg font-semibold leading-none">Yjs Docs</p>
            <p class="mt-1 text-sm text-slate-300">在线协同编辑器</p>
          </div>
        </div>

        <div class="relative z-10 max-w-2xl py-12 lg:py-0">
          <p class="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-cyan-100 ring-1 ring-white/15">
            <IconSparkles class="h-4 w-4" />
            多人编辑、状态同步、团队文档工作台
          </p>
          <h1 class="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">把团队文档、评论和实时光标放在一个清爽界面里。</h1>
          <p class="mt-5 max-w-xl text-base leading-7 text-slate-300">
            面向产品、运营、研发协作场景设计，登录后直接进入文档列表，创建或打开文档即可进入实时编辑。
          </p>
        </div>

        <div class="relative z-10 grid gap-3 sm:grid-cols-3">
          <div class="rounded-lg bg-white/10 p-4 ring-1 ring-white/10">
            <p class="text-2xl font-semibold">12ms</p>
            <p class="mt-1 text-sm text-slate-300">协作响应</p>
          </div>
          <div class="rounded-lg bg-white/10 p-4 ring-1 ring-white/10">
            <p class="text-2xl font-semibold">3</p>
            <p class="mt-1 text-sm text-slate-300">权限角色</p>
          </div>
          <div class="rounded-lg bg-white/10 p-4 ring-1 ring-white/10">
            <p class="text-2xl font-semibold">Yjs</p>
            <p class="mt-1 text-sm text-slate-300">实时同步</p>
          </div>
        </div>
      </div>

      <div class="flex min-h-screen items-center justify-center px-5 py-10">
        <div class="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
          <div class="mb-6">
            <p class="text-sm font-medium text-sky-700">协同文档空间</p>
            <h2 class="mt-2 text-2xl font-semibold">{{ authMode === "login" ? "登录账户" : "创建账户" }}</h2>
            <p class="mt-2 text-sm text-slate-500">使用账号进入你的团队文档工作台。</p>
          </div>

          <div class="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              :class="[
                'h-9 rounded-md text-sm font-semibold transition',
                authMode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900',
              ]"
              @click="switchAuthMode('login')"
            >
              登录
            </button>
            <button
              type="button"
              :class="[
                'h-9 rounded-md text-sm font-semibold transition',
                authMode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900',
              ]"
              @click="switchAuthMode('register')"
            >
              注册
            </button>
          </div>

          <form class="space-y-4" @submit.prevent="submitAuth">
            <template v-if="authMode === 'login'">
              <label class="block">
                <span class="text-sm font-medium text-slate-700">账号</span>
                <div class="relative mt-2">
                  <IconMail class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model="loginForm.account"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    placeholder="请输入账号"
                    type="text"
                    autocomplete="username"
                    required
                  />
                </div>
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">密码</span>
                <div class="relative mt-2">
                  <IconShieldCheck class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    v-model="loginForm.password"
                    class="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    placeholder="请输入密码"
                    type="password"
                    autocomplete="current-password"
                    required
                  />
                </div>
              </label>
            </template>

            <template v-else>
              <label class="block">
                <span class="text-sm font-medium text-slate-700">账号</span>
                <input
                  v-model="registerForm.account"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="请输入账号"
                  type="text"
                  autocomplete="username"
                  required
                />
              </label>

              <label class="block">
                <span class="text-sm font-medium text-slate-700">密码</span>
                <input
                  v-model="registerForm.password"
                  class="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="请输入密码"
                  type="password"
                  autocomplete="new-password"
                  required
                />
              </label>
            </template>

            <p v-if="errorMessage" class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {{ errorMessage }}
            </p>

            <button
              type="submit"
              class="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              :disabled="isSubmittingAuth"
            >
              {{ isSubmittingAuth ? "处理中..." : authMode === "login" ? "登录" : "注册并进入" }}
            </button>
          </form>
        </div>
      </div>
    </section>
  </main>
</template>
