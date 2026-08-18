import { createRouter, createWebHistory } from "vue-router";
import { hasAuthToken, setAuthExpiredHandler } from "@/services/api";
import { clearCurrentAccount } from "@/utils/session";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      redirect: "/documents",
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/documents",
      name: "documents",
      component: () => import("@/views/DocumentsView.vue"),
    },
    {
      path: "/documents/:id",
      name: "document-editor",
      component: () => import("@/views/EditorView.vue"),
      props: true,
    },
    {
      path: "/documents/:id/collaboration/:feature?",
      name: "document-collaboration",
      component: () => import("@/views/CollaborationWorkspaceView.vue"),
      props: true,
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/documents",
    },
  ],
});

router.beforeEach((to) => {
  const isAuthed = hasAuthToken();

  if (!to.meta.public && !isAuthed) {
    return { name: "login", query: { redirect: to.fullPath } };
  }

  if (to.name === "login" && isAuthed) {
    return { name: "documents" };
  }
});

setAuthExpiredHandler(() => {
  clearCurrentAccount();

  if (router.currentRoute.value.name === "login") {
    return;
  }

  router.replace({
    name: "login",
    query: {
      redirect: router.currentRoute.value.fullPath,
      reason: "expired",
    },
  });
});

export default router;
