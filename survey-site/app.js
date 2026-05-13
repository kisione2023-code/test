(async function () {
  const config = window.SURVEY_CONFIG || {};
  const people = window.SURVEY_PEOPLE || await loadPeople();

  const blockDefs = [
    { key: "russian:actors", market: "russian", group: "actors", title: "Русские актеры", kicker: "Блок 1" },
    { key: "international:actors", market: "international", group: "actors", title: "Иностранные актеры", kicker: "Блок 2" },
    { key: "russian:makers", market: "russian", group: "makers", title: "Русские режиссеры, сценаристы и продюсеры", kicker: "Блок 3" },
    { key: "international:makers", market: "international", group: "makers", title: "Иностранные режиссеры, сценаристы и продюсеры", kicker: "Блок 4" }
  ];

  const state = {
    respondentId: "",
    startedAt: new Date().toISOString(),
    index: 0,
    answers: {},
    favorites: []
  };

  const blocks = blockDefs.map((block) => {
    const rows = people.filter((person) => person.market === block.market && person.group === block.group);
    const limit = config.sampleLimits ? config.sampleLimits[block.key] : null;
    return { ...block, people: limit ? seededShuffle(rows, getSessionSeed()).slice(0, limit) : rows };
  });

  const sequence = blocks.flatMap((block) => block.people.map((person) => ({ block, person })));

  const intro = document.getElementById("intro");
  const survey = document.getElementById("survey");
  const favorites = document.getElementById("favorites");
  const done = document.getElementById("done");
  const card = document.getElementById("personCard");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const blockKicker = document.getElementById("blockKicker");
  const blockTitle = document.getElementById("blockTitle");
  const blockCount = document.getElementById("blockCount");

  document.getElementById("startButton").addEventListener("click", () => {
    state.respondentId = document.getElementById("respondentId").value.trim();
    intro.classList.add("hidden");
    survey.classList.remove("hidden");
    render();
  });

  document.getElementById("backButton").addEventListener("click", () => {
    if (state.index > 0) {
      state.index -= 1;
      render();
    }
  });

  document.getElementById("nextButton").addEventListener("click", () => {
    if (state.index < sequence.length - 1) {
      state.index += 1;
      render();
    } else {
      showFavorites();
    }
  });

  document.getElementById("favoritesBackButton").addEventListener("click", () => {
    favorites.classList.add("hidden");
    survey.classList.remove("hidden");
    state.index = Math.max(0, sequence.length - 1);
    render();
  });

  document.getElementById("favoritesDoneButton").addEventListener("click", () => {
    finish();
  });

  document.getElementById("downloadCsv").addEventListener("click", () => download("survey-results.csv", toCsv(), "text/csv"));
  document.getElementById("downloadJson").addEventListener("click", () => {
    download("survey-results.json", JSON.stringify(buildPayload(), null, 2), "application/json");
  });

  updateProgress();

  function render() {
    const current = sequence[state.index];
    if (!current) return finish();

    const { block, person } = current;
    const answer = state.answers[person.id] || { known: null, rating: null };
    const peopleInBlock = block.people.length;
    const blockIndex = block.people.findIndex((item) => item.id === person.id) + 1;

    blockKicker.textContent = block.kicker;
    blockTitle.textContent = block.title;
    blockCount.textContent = `${blockIndex} / ${peopleInBlock}`;

    const roles = person.roles.map(roleLabel).join(", ");
    const initials = person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const image = person.image
      ? `<img src="${escapeAttr(person.image)}" alt="${escapeAttr(person.name)}" loading="eager" />`
      : `<div class="portrait-fallback" aria-hidden="true">${escapeHtml(initials)}</div>`;

    card.innerHTML = `
      <div class="portrait">${image}</div>
      <div class="person-body">
        <div class="person-meta">
          <span class="pill">${marketLabel(person.market)}</span>
          <span class="pill">${roles}</span>
        </div>
        <div>
          <h3 class="person-name">${escapeHtml(person.name)}</h3>
          <p class="person-title">${escapeHtml(person.title)}</p>
        </div>
        <div>
          <div class="question-label">Вам известен этот человек?</div>
          <div class="choice-grid">
            <button class="choice" type="button" data-known="yes" aria-pressed="${answer.known === "yes"}">Знаю</button>
            <button class="choice" type="button" data-known="no" aria-pressed="${answer.known === "no"}">Не знаю</button>
          </div>
        </div>
        <div class="rating-wrap ${answer.known === "yes" ? "visible" : ""}" id="ratingWrap">
          <div class="question-label">Насколько он или она вам нравится?</div>
          <div class="rating-grid">
            ${[1, 2, 3, 4, 5].map((value) => `<button class="rate" type="button" data-rating="${value}" aria-pressed="${answer.rating === value}">${value}</button>`).join("")}
            <button class="rate" type="button" data-rating="cannot_rate" aria-pressed="${answer.rating === "cannot_rate"}">Не могу оценить</button>
          </div>
        </div>
      </div>
    `;

    card.querySelectorAll("[data-known]").forEach((button) => {
      button.addEventListener("click", () => {
        const known = button.dataset.known;
        const existing = state.answers[person.id] || {};
        state.answers[person.id] = { ...existing, known, rating: known === "yes" ? existing.rating || null : null };
        render();
      });
    });

    card.querySelectorAll("[data-rating]").forEach((button) => {
      button.addEventListener("click", () => {
        const raw = button.dataset.rating;
        state.answers[person.id] = { ...(state.answers[person.id] || {}), known: "yes", rating: raw === "cannot_rate" ? raw : Number(raw) };
        render();
      });
    });

    document.getElementById("backButton").disabled = state.index === 0;
    document.getElementById("nextButton").textContent = state.index === sequence.length - 1 ? "Завершить" : "Дальше";
    updateProgress();
  }

  function showFavorites() {
    const candidates = getFavoriteCandidates();
    state.favorites = state.favorites.filter((id) => candidates.some(({ person }) => person.id === id));

    if (!candidates.length) {
      finish();
      return;
    }

    survey.classList.add("hidden");
    favorites.classList.remove("hidden");
    renderFavorites(candidates);
    updateProgress(false, true);
  }

  function renderFavorites(candidates = getFavoriteCandidates()) {
    const maxFavorites = Math.min(3, candidates.length);
    const favoritesGrid = document.getElementById("favoritesGrid");
    const favoritesCount = document.getElementById("favoritesCount");
    favoritesCount.textContent = `${state.favorites.length} / ${maxFavorites}`;

    favoritesGrid.innerHTML = candidates.map(({ block, person }) => {
      const selectedIndex = state.favorites.indexOf(person.id);
      const selected = selectedIndex !== -1;
      const roles = person.roles.map(roleLabel).join(", ");
      const initials = person.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
      const image = person.image
        ? `<img src="${escapeAttr(person.image)}" alt="${escapeAttr(person.name)}" loading="lazy" />`
        : `<div class="favorite-fallback" aria-hidden="true">${escapeHtml(initials)}</div>`;

      return `
        <button class="favorite-card" type="button" data-favorite-id="${escapeAttr(person.id)}" aria-pressed="${selected}">
          <span class="favorite-image">${image}</span>
          <span class="favorite-copy">
            <span class="favorite-name">${escapeHtml(person.name)}</span>
            <span class="favorite-title">${escapeHtml(person.title)}</span>
            <span class="favorite-meta">${escapeHtml(block.title)} · ${escapeHtml(roles)}</span>
          </span>
          ${selected ? `<span class="favorite-rank">${selectedIndex + 1}</span>` : ""}
        </button>
      `;
    }).join("");

    favoritesGrid.querySelectorAll("[data-favorite-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.favoriteId;
        const selectedIndex = state.favorites.indexOf(id);
        if (selectedIndex !== -1) {
          state.favorites.splice(selectedIndex, 1);
        } else if (state.favorites.length < maxFavorites) {
          state.favorites.push(id);
        }
        renderFavorites(candidates);
      });
    });

    document.getElementById("favoritesDoneButton").disabled = state.favorites.length !== maxFavorites;
  }

  function getFavoriteCandidates() {
    return sequence.filter(({ person }) => {
      const rating = (state.answers[person.id] || {}).rating;
      return rating === 4 || rating === 5;
    });
  }

  async function finish() {
    survey.classList.add("hidden");
    favorites.classList.add("hidden");
    done.classList.remove("hidden");
    updateProgress(true);

    if (config.formEndpoint) {
      try {
        await fetch(config.formEndpoint, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload())
        });
      } catch (error) {
        console.warn("Submit failed", error);
      }
    }
  }

  function updateProgress(doneState = false, favoritesState = false) {
    const total = sequence.length || 0;
    const current = doneState || favoritesState ? total : Math.min(state.index + (survey.classList.contains("hidden") ? 0 : 1), total);
    progressText.textContent = favoritesState ? `${total} / ${total} + финал` : `${current} / ${total}`;
    progressFill.style.width = total ? `${Math.round((current / total) * 100)}%` : "0%";
  }

  function buildPayload() {
    const finishedAt = new Date().toISOString();
    return {
      respondentId: state.respondentId,
      startedAt: state.startedAt,
      finishedAt,
      favorites: state.favorites.map((id, index) => {
        const item = sequence.find(({ person }) => person.id === id);
        return item ? { rank: index + 1, personId: id, name: item.person.name } : { rank: index + 1, personId: id, name: "" };
      }),
      answers: sequence.map(({ block, person }) => ({
        respondentId: state.respondentId,
        block: block.title,
        market: person.market,
        group: person.group,
        personId: person.id,
        name: person.name,
        title: person.title,
        roles: person.roles.join("|"),
        known: (state.answers[person.id] || {}).known || "",
        rating: (state.answers[person.id] || {}).rating || "",
        favoriteRank: state.favorites.indexOf(person.id) === -1 ? "" : state.favorites.indexOf(person.id) + 1,
        source: person.source,
        price: person.price,
        currency: person.currency,
        url: person.url,
        startedAt: state.startedAt,
        finishedAt
      }))
    };
  }

  function toCsv() {
    const rows = buildPayload().answers;
    const headers = Object.keys(rows[0] || {});
    return [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
    ].join("\n");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getSessionSeed() {
    const key = "celebrity-survey-seed";
    let seed = localStorage.getItem(key);
    if (!seed) {
      seed = `${Date.now()}-${Math.random()}`;
      localStorage.setItem(key, seed);
    }
    return seed;
  }

  function seededShuffle(items, seedText) {
    const result = [...items];
    let seed = 0;
    for (let i = 0; i < seedText.length; i += 1) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
    for (let i = result.length - 1; i > 0; i -= 1) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function roleLabel(role) {
    return {
      actor: "актер",
      director: "режиссер",
      writer: "сценарист",
      producer: "продюсер",
      maker: "кино / TV"
    }[role] || role;
  }

  function marketLabel(market) {
    return market === "russian" ? "русские" : "иностранные";
  }

  function trimPrice(value) {
    return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  async function loadPeople() {
    const response = await fetch("data/people.json");
    return response.json();
  }
})();
