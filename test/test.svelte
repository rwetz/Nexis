<script lang="ts">
  // Test Svelte 5 file — Nexis editor playground
  // Exercises: runes ($state, $derived, $effect, $props), stores,
  //            lifecycle, slots/snippets, transitions, actions

  import { onMount, onDestroy, tick } from 'svelte'
  import { writable, derived, readable } from 'svelte/store'
  import { fade, fly, scale } from 'svelte/transition'
  import { spring, tweened } from 'svelte/motion'
  import { cubicOut, elasticOut } from 'svelte/easing'

  // ── Runes (Svelte 5) ────────────────────────────��───────────────────────────

  let count  = $state(0)
  let name   = $state('Nexis')
  let items  = $state<string[]>([])
  let filter = $state('')

  const doubled = $derived(count * 2)
  const filtered = $derived(
    items.filter(i => i.toLowerCase().includes(filter.toLowerCase()))
  )

  $effect(() => {
    document.title = `Nexis Svelte (${count})`
  })

  $effect(() => {
    if (items.length > 10) {
      console.warn('Too many items!')
    }
  })

  // ── Stores ──────────────────────────────────────────────────────────────────

  const theme = writable<'dark' | 'light'>('dark')

  interface User { id: number; name: string; score: number }
  const users = writable<User[]>([
    { id: 1, name: 'Alice', score: 95 },
    { id: 2, name: 'Bob',   score: 78 },
    { id: 3, name: 'Carol', score: 88 },
  ])

  const topUser = derived(users, $users =>
    $users.reduce((best, u) => u.score > best.score ? u : best)
  )

  const clock = readable(new Date(), set => {
    const timer = setInterval(() => set(new Date()), 1000)
    return () => clearInterval(timer)
  })

  // ── Animations ──────────────────────────────────────────────────────────────

  const progress = tweened(0, { duration: 800, easing: cubicOut })
  const bouncy   = spring(0,  { stiffness: 0.1, damping: 0.2 })

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  onMount(() => {
    console.log('[mounted] Svelte playground')
    items = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']
    progress.set(65)
  })

  // ── Actions ─────────────────────────────────────────────────────────────────

  function tooltip(node: HTMLElement, text: string) {
    const tip = document.createElement('div')
    tip.className = 'tooltip'
    tip.textContent = text

    const show = () => {
      document.body.appendChild(tip)
      const r = node.getBoundingClientRect()
      tip.style.cssText = `position:fixed;top:${r.top - 32}px;left:${r.left + r.width/2}px;transform:translateX(-50%)`
    }
    const hide = () => tip.remove()

    node.addEventListener('mouseenter', show)
    node.addEventListener('mouseleave', hide)

    return {
      update: (newText: string) => { tip.textContent = newText },
      destroy: () => { hide(); node.removeEventListener('mouseenter', show); node.removeEventListener('mouseleave', hide) }
    }
  }

  function clickOutside(node: HTMLElement, handler: () => void) {
    const handleClick = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) handler()
    }
    document.addEventListener('click', handleClick, true)
    return { destroy: () => document.removeEventListener('click', handleClick, true) }
  }

  function autofocus(node: HTMLInputElement) {
    node.focus()
    return {}
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  let inputValue = $state('')
  let modalOpen  = $state(false)
  let selectedUser = $state<User | null>(null)

  function addItem() {
    const v = inputValue.trim()
    if (v && !items.includes(v)) {
      items = [...items, v]
      inputValue = ''
    }
  }

  function removeItem(item: string) {
    items = items.filter(i => i !== item)
  }

  async function bumpCount() {
    count++
    await tick()
    bouncy.set(count)
  }
</script>

<!-- ── Template ───────────────────────────────��─────────────────────────────── -->

<svelte:head>
  <title>Svelte Playground — Nexis</title>
</svelte:head>

<main class="app" data-theme={$theme}>
  <header>
    <h1>Svelte 5 Playground</h1>
    <button on:click={() => theme.update(t => t === 'dark' ? 'light' : 'dark')}>
      Toggle theme
    </button>
    <time>{$clock.toLocaleTimeString()}</time>
  </header>

  <!-- ── Counter with springs ───────────────────────────���─────────────────── -->
  <section class="card">
    <h2>Counter (runes + spring)</h2>
    <div class="counter">
      <button on:click={() => count--}>−</button>
      <span style="transform: scale({$bouncy / 10 + 1})">{count}</span>
      <button on:click={bumpCount}>+</button>
    </div>
    <p>Doubled (derived): {doubled}</p>
  </section>

  <!-- ── Progress bar (tweened) ───────────────────────────────────────────── -->
  <section class="card">
    <h2>Tweened progress</h2>
    <div class="progress-track">
      <div class="progress-bar" style="width: {$progress}%"></div>
    </div>
    <button on:click={() => progress.set(Math.random() * 100)}>Randomise</button>
  </section>

  <!-- ── Store-driven table ────────────────────────────────────────────────── -->
  <section class="card">
    <h2>Users (store + derived)</h2>
    <p>Top scorer: <strong>{$topUser.name}</strong> ({$topUser.score})</p>
    <table>
      <thead><tr><th>Name</th><th>Score</th><th></th></tr></thead>
      <tbody>
        {#each $users as user (user.id)}
          <tr
            class:selected={selectedUser?.id === user.id}
            on:click={() => selectedUser = user}
          >
            <td>{user.name}</td>
            <td>{user.score}</td>
            <td>
              <button on:click|stopPropagation={() => users.update(us => us.filter(u => u.id !== user.id))}>
                ✕
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if selectedUser}
      <p transition:fly={{ y: 8, duration: 200 }}>
        Selected: {selectedUser.name}
      </p>
    {/if}
  </section>

  <!-- ── Filterable list with transitions ─────────────────────────────────── -->
  <section class="card">
    <h2>Filterable list</h2>
    <div class="row">
      <input
        use:autofocus
        bind:value={filter}
        placeholder="Filter…"
        class="input"
      />
      <input bind:value={inputValue} placeholder="Add item…" class="input" on:keydown={e => e.key === 'Enter' && addItem()} />
      <button on:click={addItem}>Add</button>
    </div>
    <ul>
      {#each filtered as item (item)}
        <li transition:scale={{ duration: 200, easing: elasticOut }}>
          {item}
          <button on:click={() => removeItem(item)}>×</button>
        </li>
      {:else}
        <li class="empty" transition:fade>No items match "{filter}"</li>
      {/each}
    </ul>
  </section>

  <!-- ── Action tooltip ──────────────────────��─────────────────────────────── -->
  <section class="card">
    <h2>Actions</h2>
    <button use:tooltip={"I have a tooltip!"}>Hover me</button>
  </section>

  <!-- ── Modal via {#if} + transition ───────────────────────────���─────────── -->
  <button on:click={() => modalOpen = true} class="btn--primary">Open modal</button>

  {#if modalOpen}
    <div
      class="overlay"
      transition:fade={{ duration: 150 }}
      use:clickOutside={() => modalOpen = false}
    >
      <div class="modal" transition:fly={{ y: 20, duration: 200 }}>
        <h2>Modal</h2>
        <p>Rendered in-place with Svelte transitions.</p>
        <button on:click={() => modalOpen = false}>Close</button>
      </div>
    </div>
  {/if}
</main>

<style>
  :global(body) { margin: 0; font-family: system-ui, sans-serif; }

  .app {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem 1rem;
    background: #0f172a;
    color: #f1f5f9;
    min-height: 100dvh;
  }

  .app[data-theme="light"] { background: #f8fafc; color: #0f172a; }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .counter {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 2rem;
  }

  .counter span { display: inline-block; min-width: 2ch; text-align: center; }

  .progress-track { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin-bottom: 0.75rem; }
  .progress-bar   { height: 100%; background: #6366f1; border-radius: 4px; transition: width 0.3s; }

  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
  tr.selected td { background: rgba(99, 102, 241, 0.15); }
  tr:hover td { background: rgba(255,255,255,0.04); cursor: pointer; }

  .row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
  .input { flex: 1; padding: 0.5rem 0.75rem; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: inherit; font: inherit; }

  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #334155; }
  .empty { color: #64748b; justify-content: center; }

  button {
    padding: 0.4em 0.8em;
    border-radius: 6px;
    border: 1px solid #475569;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }

  .btn--primary { background: #6366f1; border-color: transparent; color: #fff; }

  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
  .modal { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 2rem; width: min(420px, 90vw); }

  :global(.tooltip) {
    background: #0f172a;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 0.8rem;
    pointer-events: none;
    z-index: 9999;
  }
</style>
