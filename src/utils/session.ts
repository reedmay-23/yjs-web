export const ACCOUNT_KEY = "yjs_docs_account";

export const getCurrentAccount = () => sessionStorage.getItem(ACCOUNT_KEY) ?? "我";

export const setCurrentAccount = (account: string) => {
  sessionStorage.setItem(ACCOUNT_KEY, account);
  localStorage.removeItem(ACCOUNT_KEY);
};

export const clearCurrentAccount = () => {
  sessionStorage.removeItem(ACCOUNT_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
};
