<script lang="ts">
  import { Trash2 } from "@lucide/svelte";
  import Button from "../components/Button.svelte";
  import IconButton from "../components/IconButton.svelte";
  import type { Ai } from "../ai.svelte";

  /** AI view: "Slayttan kart üret" — drafts the user keeps, edits or deletes before they become cards. */
  let { ai, onstudy }: { ai: Ai; onstudy: () => void } = $props();
  const kept = $derived(ai.drafts.filter((d) => d.keep).length);
</script>

<section class="card" aria-label="Slayttan kart üret">
  <h2>Slayttan kart üret</h2>
  <p class="muted">Seçtiğin sayfalardan kavram kartları ve çoktan seçmeli sorular hazırlanır. Kaydetmeden önce gözden geçir; kaydedilenler Çalışma Merkezi'ndeki kartlara ve teste eklenir.</p>
  {#if ai.docs.length}
    <div class="row">
      <select aria-label="Kart için belge" value={ai.cardsDocId} onchange={(e) => ai.setCardsDoc(Number(e.currentTarget.value))}>
        {#each ai.docs as d (d.id)}<option value={d.id}>{d.title}</option>{/each}
      </select>
      <label class="num">Sayfa <input type="number" min="1" inputmode="numeric" aria-label="İlk sayfa" bind:value={ai.cardsFrom} /></label>
      <label class="num">– <input type="number" min="1" inputmode="numeric" aria-label="Son sayfa" bind:value={ai.cardsTo} /></label>
      {#if ai.busy === "cards"}
        <Button onclick={() => ai.stop()}>Durdur</Button>
      {:else}
        <Button variant="primary" disabled={!!ai.busy || !ai.canAnswer} onclick={() => ai.generateCards()}>Kart üret</Button>
      {/if}
    </div>
    {#if ai.busy === "cards" && ai.phase}<p class="muted" role="status">{ai.phase}</p>{/if}
    {#if ai.cardsSaved != null}
      <p class="saved" role="status">{ai.cardsSaved} kart kaydedildi. <button class="link" onclick={onstudy}>Çalışma Merkezi'ne git</button></p>
    {/if}
    {#if ai.drafts.length}
      <p class="muted">{ai.drafts.length} öneri{ai.draftsSkipped ? ` (${ai.draftsSkipped} hatalı öneri atlandı)` : ""}. Tutmak istemediklerinin işaretini kaldır.</p>
      <ul class="drafts" aria-label="Kart önerileri">
        {#each ai.drafts as d, i (i)}
          <li class:off={!d.keep}>
            <label class="keep"><input type="checkbox" bind:checked={d.keep} aria-label="Kartı tut" /></label>
            <div class="fields">
              {#if d.kind === "term"}
                <span class="kind">Kavram · s. {d.page}</span>
                <input aria-label="Kavram" bind:value={d.term} />
                <textarea aria-label="Tanım" rows="2" bind:value={d.definition}></textarea>
              {:else}
                <span class="kind">Soru · s. {d.page}</span>
                <input aria-label="Soru" bind:value={d.question} />
                <input class="answer" aria-label="Doğru cevap" bind:value={d.answer} />
                {#each d.wrong as _, j (j)}
                  <input class="wrong" aria-label="Yanlış seçenek {j + 1}" bind:value={d.wrong[j]} />
                {/each}
              {/if}
            </div>
            <IconButton label="Öneriyi sil" onclick={() => ai.drafts.splice(i, 1)}><Trash2 size={18} /></IconButton>
          </li>
        {/each}
      </ul>
      <div class="row end">
        <Button onclick={() => (ai.drafts = [])}>Vazgeç</Button>
        <Button variant="primary" disabled={!kept} onclick={() => ai.saveDrafts()}>{kept} kartı kaydet</Button>
      </div>
    {/if}
  {:else}
    <p class="muted">Bu derste belge yok.</p>
  {/if}
</section>

<style>
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
  .muted, .saved { color: var(--text-2); font-size: 13px; margin: 0; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .row select { flex: 1 1 200px; }
  .end { justify-content: flex-end; }
  .num { display: flex; align-items: center; gap: 6px; color: var(--text-2); }
  .num input { width: 72px; }
  select, input, textarea {
    min-height: var(--hit); padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); min-width: 0; font: inherit;
  }
  textarea { padding: 8px 10px; resize: vertical; }
  .drafts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .drafts li { display: flex; gap: 8px; align-items: flex-start; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
  .drafts li.off { opacity: 0.55; }
  .keep { min-width: var(--hit); min-height: var(--hit); display: grid; place-items: center; cursor: pointer; }
  .keep input { width: 20px; height: 20px; min-height: 0; accent-color: var(--accent); }
  .fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .kind { font-size: 12px; color: var(--text-2); font-weight: 600; }
  .answer { border-color: var(--accent); }
  .wrong { color: var(--text-2); }
  .link { border: 0; background: transparent; color: var(--accent); cursor: pointer; font: inherit; min-height: var(--hit); padding: 0 4px; text-decoration: underline; }
</style>
