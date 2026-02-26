<script setup lang="ts">
import TipTapEditor from "./components/TipTapEditor/TipTapEditor.vue";

import example from "./assets/example.txt?raw";
import {ref} from "vue";

const content = ref<string>(example);

</script>

<template>
  <div class="w-9/10 mx-auto mt-[10px]">
    <TipTapEditor v-model="content"></TipTapEditor>
  </div>
</template>

<style scoped>
</style>
