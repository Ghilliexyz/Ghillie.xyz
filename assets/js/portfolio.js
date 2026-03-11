(function () {
    "use strict";

    const PAGE_SIZE = 27;
    let currentFilter = "All";
    let currentPage = 1;
    let currentEntries = [];
    let lightboxIndex = 0;
    let lightboxEntries = [];

    // ===== TAB SWITCHING =====
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            tabBtns.forEach(function (b) { b.classList.remove("active"); });
            tabContents.forEach(function (tc) { tc.classList.remove("active"); });
            btn.classList.add("active");
            document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        });
    });

    // ===== FILTER PILLS =====
    var pillsContainer = document.getElementById("filter-pills");

    // Build pills from views data (skip "All" at index 0, but add our own "All" first)
    var creatorNames = ["All"];
    for (var i = 1; i < views.length; i++) {
        creatorNames.push(views[i].Name);
    }

    creatorNames.forEach(function (name) {
        var pill = document.createElement("button");
        pill.className = "filter-pill" + (name === "All" ? " active" : "");
        pill.textContent = name.replace(/([a-z])([A-Z])/g, "$1 $2"); // CamelCase to spaced
        pill.dataset.filter = name;
        pill.addEventListener("click", function () {
            document.querySelectorAll(".filter-pill").forEach(function (p) { p.classList.remove("active"); });
            pill.classList.add("active");
            currentFilter = name;
            currentPage = 1;
            renderGallery();
        });
        pillsContainer.appendChild(pill);
    });

    // ===== GALLERY RENDERING =====
    var galleryGrid = document.getElementById("gallery-grid");
    var loadMoreWrap = document.getElementById("load-more-wrap");
    var loadMoreBtn = document.getElementById("load-more-btn");
    var galleryCount = document.getElementById("gallery-count");

    function getFilteredEntries(filter) {
        for (var i = 0; i < views.length; i++) {
            if (views[i].Anchor === filter || views[i].Name === filter) {
                return views[i].Entries;
            }
        }
        return [];
    }

    function renderGallery() {
        currentEntries = getFilteredEntries(currentFilter);
        var endIndex = currentPage * PAGE_SIZE;
        var visibleEntries = currentEntries.slice(0, endIndex);

        galleryGrid.innerHTML = "";

        visibleEntries.forEach(function (entry, idx) {
            var item = document.createElement("div");
            item.className = "gallery-item";
            item.addEventListener("click", function () {
                openLightbox(idx);
            });

            var img = document.createElement("img");
            img.src = entry.Image;
            img.alt = entry.Title;
            img.loading = "lazy";

            var overlay = document.createElement("div");
            overlay.className = "gallery-overlay";

            var title = document.createElement("span");
            title.className = "gallery-overlay-title";
            title.textContent = entry.Title;

            var viewsText = document.createElement("span");
            viewsText.className = "gallery-overlay-views";
            viewsText.textContent = entry.Views;

            overlay.appendChild(title);
            overlay.appendChild(viewsText);
            item.appendChild(img);
            item.appendChild(overlay);
            galleryGrid.appendChild(item);
        });

        // Show/hide Load More + count
        if (endIndex < currentEntries.length) {
            loadMoreWrap.style.display = "block";
            galleryCount.textContent = "Showing " + visibleEntries.length + " of " + currentEntries.length;
        } else {
            loadMoreWrap.style.display = "none";
        }

        // Update lightbox entries reference
        lightboxEntries = visibleEntries;
    }

    loadMoreBtn.addEventListener("click", function () {
        currentPage++;
        renderGallery();
    });

    // ===== LIGHTBOX =====
    var lightbox = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightbox-img");
    var lightboxTitle = document.getElementById("lightbox-title");
    var lightboxViews = document.getElementById("lightbox-views");
    var lightboxLink = document.getElementById("lightbox-link");

    function openLightbox(index) {
        lightboxIndex = index;
        updateLightbox();
        lightbox.classList.remove("closing");
        lightbox.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
        lightbox.classList.add("closing");
        lightbox.addEventListener("animationend", function handler() {
            lightbox.classList.remove("open", "closing");
            document.body.style.overflow = "";
            lightbox.removeEventListener("animationend", handler);
        });
    }

    function updateLightbox() {
        var entry = lightboxEntries[lightboxIndex];
        if (!entry) return;
        lightboxImg.src = entry.Image;
        lightboxImg.alt = entry.Title;
        lightboxTitle.textContent = entry.Title;
        lightboxViews.textContent = entry.Views;
        if (entry.Link) {
            lightboxLink.href = entry.Link;
            lightboxLink.style.display = "";
        } else {
            lightboxLink.style.display = "none";
        }
    }

    function lightboxPrev() {
        lightboxIndex = (lightboxIndex - 1 + lightboxEntries.length) % lightboxEntries.length;
        updateLightbox();
    }

    function lightboxNext() {
        lightboxIndex = (lightboxIndex + 1) % lightboxEntries.length;
        updateLightbox();
    }

    document.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
    document.querySelector(".lightbox-overlay").addEventListener("click", closeLightbox);
    document.querySelector(".lightbox-prev").addEventListener("click", lightboxPrev);
    document.querySelector(".lightbox-next").addEventListener("click", lightboxNext);

    document.addEventListener("keydown", function (e) {
        if (!lightbox.classList.contains("open")) return;
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowLeft") lightboxPrev();
        if (e.key === "ArrowRight") lightboxNext();
    });

    // ===== HANDLE URL HASH =====
    var hash = location.hash.substring(1);
    if (hash === "code") {
        // Switch to code tab
        tabBtns.forEach(function (b) { b.classList.remove("active"); });
        tabContents.forEach(function (tc) { tc.classList.remove("active"); });
        document.querySelector('[data-tab="code"]').classList.add("active");
        document.getElementById("tab-code").classList.add("active");
    } else if (hash) {
        // Try to select a creator filter
        var matchedPill = document.querySelector('.filter-pill[data-filter="' + hash + '"]');
        if (matchedPill) {
            matchedPill.click();
        }
    }

    // ===== INITIAL RENDER =====
    renderGallery();
})();
