import { mount } from "svelte";
import App from "./App.svelte";
import "@fontsource-variable/manrope";
import "@fontsource-variable/hanken-grotesk";
import "./ui/tokens.css";
import { createPlatform } from "./platform";
import { Library } from "./ui/library.svelte";
import "./ui/names.svelte"; // user names for labels and flags, before the first render
import { applyTheme, loadTheme } from "./ui/theme";
import { watcherFor } from "./ui/watcher.svelte";

applyTheme(loadTheme());

const lib = new Library(await createPlatform());
await lib.refresh();
mount(App, { target: document.getElementById("app")!, props: { lib } });
watcherFor(lib).start();
