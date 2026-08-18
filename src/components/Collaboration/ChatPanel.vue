<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { collabApi, type FeatureEvent } from "@/services/collabFeatures";
import { useFeatureSocket } from "@/composables/useFeatureSocket";
import { searchUsers, type ApiUserSearchItem } from "@/services/api";
import { getApiErrorMessage, toInitials } from "@/utils/workspace";
import { getCurrentAccount } from "@/utils/session";
import type { ChatMessage, ChatRoom, ResourceId } from "@/types/collab-features";
import FeatureStatus from "./FeatureStatus.vue";
import IconArrowBackUp from "~icons/tabler/arrow-back-up";
import IconMoodSmile from "~icons/tabler/mood-smile";
import IconSend from "~icons/tabler/send";
import IconX from "~icons/tabler/x";

const props = defineProps<{ documentId: ResourceId; canEdit?: boolean; resourceId?: ResourceId; embedded?: boolean }>();
const emit = defineEmits<{ (event: "resource-ready", id: ResourceId): void }>();
const room = ref<ChatRoom | null>(null);
const messages = ref<ChatMessage[]>([]);
const content = ref("");
const replyingTo = ref<ChatMessage | null>(null);
const loading = ref(true);
const sending = ref(false);
const errorMessage = ref("");
const messageListRef = ref<HTMLElement | null>(null);
const currentAccount = getCurrentAccount();
const { status, canWrite, connect, send } = useFeatureSocket();

const sortedMessages = computed(() => [...messages.value].sort((a, b) => {
  const first = a.createdAt ? new Date(a.createdAt).getTime() : Number(a.id);
  const second = b.createdAt ? new Date(b.createdAt).getTime() : Number(b.id);
  return first - second;
}));

const authorName = (message: ChatMessage) => message.author?.name ?? message.author?.account ?? message.user?.name ?? message.user?.account ?? message.username ?? message.account ?? "协作者";
const formatTime = (value?: string) => value ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "刚刚";
const parentMessage = (message: ChatMessage) => messages.value.find((item) => String(item.id) === String(message.parentId));
const scrollToBottom = () => nextTick(() => messageListRef.value?.scrollTo({ top: messageListRef.value.scrollHeight, behavior: "smooth" }));
const mentionedUserId = (user: ApiUserSearchItem) => user.id ?? user.userId ?? user.user_id;

const resolveMentions = async (text: string): Promise<ResourceId[]> => {
  const names = [...text.matchAll(/@([^\s@]+)/g)].map((match) => match[1]?.replace(/[，。！？,.!?;；:]$/, "")).filter((name): name is string => Boolean(name));
  if (!names.length) return [];
  const resolved = await Promise.all(names.map(async (name) => {
    if (/^\d+$/.test(name)) return Number(name);
    const users = await searchUsers(name);
    const exact = users.find((user) => [user.account, user.username, user.name].some((value) => value === name)) ?? users[0];
    return exact ? mentionedUserId(exact) : undefined;
  }));
  return [...new Set(resolved.filter((id): id is ResourceId => id !== undefined))];
};

const upsert = (message: ChatMessage) => {
  const index = messages.value.findIndex((item) => String(item.id) === String(message.id));
  if (index >= 0) messages.value[index] = message;
  else messages.value.push(message);
  void scrollToBottom();
};

const loadMessages = async () => { messages.value = await collabApi.getChatMessages(props.documentId); };

const handleEvent = (event: FeatureEvent) => {
  const message = event.message as ChatMessage | undefined;
  if (
    (event.type === "new_message" || event.type === "reaction_added")
    && message
    && message.contextType !== "inline_comment"
  ) upsert(message);
};

const initialize = async () => {
  loading.value = true;
  try {
    room.value = await collabApi.getOrCreateChatRoom(props.documentId);
    emit("resource-ready", room.value.id);
    await loadMessages();
    connect("chat", room.value.id, handleEvent, loadMessages);
    await scrollToBottom();
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "加载讨论区失败");
  } finally { loading.value = false; }
};

const submit = async () => {
  const text = content.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  errorMessage.value = "";
  try {
    const mentions = await resolveMentions(text);
    const message = await collabApi.sendChatMessage(props.documentId, {
      content: text,
      parentId: replyingTo.value?.id,
      mentions,
    });
    upsert(message);
    send({ type: "new_message", message });
    content.value = "";
    replyingTo.value = null;
  } catch (error) {
    errorMessage.value = getApiErrorMessage(error, "消息发送失败");
  } finally { sending.value = false; }
};

const react = async (message: ChatMessage, emoji: string) => {
  try {
    const updated = await collabApi.toggleReaction(message.id, emoji);
    upsert(updated);
    send({ type: "reaction_added", messageId: message.id, emoji, message: updated });
  } catch (error) { errorMessage.value = getApiErrorMessage(error, "表情反应失败"); }
};

const reactionEntries = (message: ChatMessage): Array<[string, number]> => {
  if (!message.reactions) return [];
  if (Array.isArray(message.reactions)) return message.reactions.map((reaction): [string, number] => [reaction.emoji ?? "👍", reaction.count ?? reaction.users?.length ?? 1]);
  return Object.entries(message.reactions).map(([emoji, value]): [string, number] => [emoji, typeof value === "number" ? value : Array.isArray(value) ? value.length : 1]);
};

onMounted(initialize);
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-slate-50">
    <div class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
      <div><h3 class="font-semibold text-slate-900">文档讨论区</h3><p class="mt-0.5 text-xs text-slate-500">支持回复、@提及与表情反应</p></div>
      <FeatureStatus :status="status" :can-write="canWrite" />
    </div>
    <p v-if="errorMessage" class="mx-5 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ errorMessage }}</p>
    <div v-if="loading" class="grid flex-1 place-items-center text-sm text-slate-500">正在加载讨论消息...</div>
    <div v-else ref="messageListRef" class="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
      <div v-if="!messages.length" class="mx-auto mt-16 max-w-sm text-center"><div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-xl">💬</div><p class="mt-4 font-semibold text-slate-800">开始文档讨论</p><p class="mt-1 text-sm text-slate-500">在这里留下问题、反馈或决策记录。</p></div>
      <div v-for="message in sortedMessages" :key="message.id" :class="['group mb-5 flex gap-3', authorName(message) === currentAccount ? 'flex-row-reverse' : '']">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-900 text-xs font-bold text-white">{{ toInitials(authorName(message)) }}</div>
        <div :class="['max-w-[78%]', authorName(message) === currentAccount ? 'items-end' : 'items-start', 'flex flex-col']">
          <div class="mb-1 flex items-center gap-2 text-xs text-slate-400"><span class="font-medium text-slate-600">{{ authorName(message) }}</span><span>{{ formatTime(message.createdAt) }}</span></div>
          <div :class="['rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm', authorName(message) === currentAccount ? 'rounded-tr-md bg-sky-600 text-white' : 'rounded-tl-md bg-white text-slate-800 ring-1 ring-slate-200']">
            <div v-if="parentMessage(message)" :class="['mb-2 rounded-lg border-l-2 px-2 py-1 text-xs', authorName(message) === currentAccount ? 'border-white/60 bg-white/10' : 'border-sky-400 bg-slate-50 text-slate-500']">回复 {{ authorName(parentMessage(message)!) }}：{{ parentMessage(message)?.content }}</div>
            <p class="whitespace-pre-wrap break-words"><template v-for="(part, index) in message.content.split(/(@[^\s]+)/g)" :key="index"><span v-if="part.startsWith('@')" class="font-semibold underline decoration-current/40">{{ part }}</span><template v-else>{{ part }}</template></template></p>
          </div>
          <div class="mt-1 flex min-h-7 flex-wrap items-center gap-1">
            <button v-for="([emoji, count], index) in reactionEntries(message)" :key="`${emoji}-${index}`" type="button" class="rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200 hover:ring-sky-300" @click="react(message, emoji)">{{ emoji }} {{ count }}</button>
            <div class="flex opacity-0 transition group-hover:opacity-100"><button type="button" class="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-white hover:text-sky-600" title="回复" @click="replyingTo = message"><IconArrowBackUp class="h-4 w-4" /></button><button v-for="emoji in ['👍', '❤️', '🎉']" :key="emoji" type="button" class="grid h-7 min-w-7 place-items-center rounded-full text-xs hover:bg-white" @click="react(message, emoji)">{{ emoji }}</button></div>
          </div>
        </div>
      </div>
    </div>
    <div class="border-t border-slate-200 bg-white p-4 md:px-8">
      <div v-if="replyingTo" class="mb-2 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600"><span class="truncate">回复 {{ authorName(replyingTo) }}：{{ replyingTo.content }}</span><button type="button" @click="replyingTo = null"><IconX class="h-4 w-4" /></button></div>
      <form class="mx-auto flex max-w-4xl items-end gap-3" @submit.prevent="submit">
        <div class="relative flex-1"><textarea v-model="content" rows="2" class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" placeholder="输入消息，使用 @姓名 提及协作者" @keydown.enter.exact.prevent="submit" /><IconMoodSmile class="absolute bottom-4 right-4 h-4 w-4 text-slate-400" /></div>
        <button type="submit" :disabled="!content.trim() || sending" class="grid h-11 w-11 place-items-center rounded-xl bg-sky-600 text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"><IconSend class="h-5 w-5" /></button>
      </form>
    </div>
  </section>
</template>
