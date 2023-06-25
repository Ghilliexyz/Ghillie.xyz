const views = [
	{
		"Name": "All",
		"Logo": "/assets/img/portfolio/DailyDose/maxresdefault (3).jpg",
		"Anchor": "All",
		"Entries": [
		],
	},
	{
		"Name": "DailyDoseOfInternet",
		"Logo": "/assets/img/portfolio/DailyDose/maxresdefault (1).jpg",
		"Anchor": "DailyDoseOfInternet",
		"Entries": [
			{
				"Image": "/assets/img/portfolio/DailyDose/DailyDoseThumbnail-CC.png",
				"Link": "https://example.com/",
				"Title": "Deserunt tempor veniam do ex aute et laborum anim nulla ex ullamco occaecat mollit fugiat.",
				"Views": "1M Views"
			},
			{
				"Image": "/assets/img/portfolio/DailyDose/maxresdefault (1).jpg",
				"Link": "https://example.com/",
				"Title": "Fugiat eu magna laborum nostrud laborum sunt incididunt est non non.",
				"Views": "2M Views"
			},
			{
				"Image": "/assets/img/portfolio/DailyDose/maxresdefault (2).jpg",
				"Link": "https://example.com/",
				"Title": "Id commodo reprehenderit culpa do magna sit sunt dolore excepteur ex.",
				"Views": "3M Views"
			},
			{
				"Image": "/assets/img/portfolio/DailyDose/maxresdefault (3).jpg",
				"Link": "https://example.com/",
				"Title": "Exercitation qui mollit mollit cupidatat nisi amet aute laboris culpa irure mollit tempor.",
				"Views": "4M Views"
			},
			{
				"Image": "/assets/img/portfolio/DailyDose/maxresdefault.jpg",
				"Link": "https://example.com/",
				"Title": "Veniam culpa officia ad ad fugiat est proident quis cupidatat ex quis adipisicing ut.",
				"Views": "5M Views"
			},
		],
	},
	{
		"Name": "MxR Plays",
		"Logo": "/assets/img/portfolio/DailyDose/maxresdefault (2).jpg",
		"Anchor": "MxR Plays",
		"Entries": [
			{
				"Image": "/assets/img/portfolio/DailyDose/DailyDoseThumbnail-CC.png",
				"Link": "https://example.com/",
				"Title": "Deserunt tempor veniam do ex aute et laborum anim nulla ex ullamco occaecat mollit fugiat.",
				"Views": "1M Views"
			},
		],
	},
	{
		"Name": "ConnorEatsPants",
		"Logo": "/assets/img/portfolio/DailyDose/maxresdefault (3).jpg",
		"Anchor": "ConnorEatsPants",
		"Entries": [
			{
				"Image": "/assets/img/portfolio/DailyDose/maxresdefault.jpg",
				"Link": "https://example.com/",
				"Title": "Veniam culpa officia ad ad fugiat est proident quis cupidatat ex quis adipisicing ut.",
				"Views": "5M Views"
			},
		],
	},
];

for (let i = 1; i < views.length; i++) {
	views[0].Entries.push(...views[i].Entries);
	views[i].Anchor = views[i].Anchor.replace(/\s/g, '');
}

(function ($) {
	"use strict";

	/* #region Cursor + MouseOver/MouseOut */
	document.getElementsByTagName("body")[0].addEventListener("mousemove", function (n) {
		cursor_layer_1.style.left = n.clientX + "px",
			cursor_layer_1.style.top = n.clientY + "px",
			cursor_layer_2.style.left = n.clientX + "px",
			cursor_layer_2.style.top = n.clientY + "px",
			cursor_layer_3.style.left = n.clientX + "px",
			cursor_layer_3.style.top = n.clientY + "px";
	});
	var cursor_layer_1 = document.getElementById("cursor"),
		cursor_layer_2 = document.getElementById("cursor2"),
		cursor_layer_3 = document.getElementById("cursor3");
	function n(t) {
		cursor_layer_2.classList.add("hover"), cursor_layer_3.classList.add("hover");
	}
	function s(t) {
		cursor_layer_2.classList.remove("hover"), cursor_layer_3.classList.remove("hover");
	}
	s();
	for (var hover_targets = document.querySelectorAll(".hover-target"), a = hover_targets.length - 1; a >= 0; a--) {
		mouseevents(hover_targets[a]);
	}
	function mouseevents(target) {
		target.addEventListener("mouseover", n), target.addEventListener("mouseout", s);
	}
	/* #endregion */

	/* #region Light/Dark mode switch */
	$(".switch").on("click", function () {
		if ($("body").hasClass("light")) {
			$("body").removeClass("light");
			$(".switch").removeClass("switched");
		} else {
			$("body").addClass("light");
			$(".switch").addClass("switched");
		}
	});
	/* #endregion */

	$(document).ready(function () {
		/* #region Generate portfolio items */
		for (let i = 0; i < views.length; i++) {
			let view = views[i];
			/* #region ADD HERO */
			// <div class="hero-center-section" id="nature">
			// 	<div class="left-text">nature</div>
			// 	<div class="container">
			// 		<div class="row justify-content-center">
			// 			<div class="col-md-8">
			// 				<div class="img-wrap">
			// 					<img src="https://s3-us-west-2.amazonaws.com/s.cdpn.io/1462889/nature.jpg" alt="">
			// 				</div>
			// 			</div>
			// 		</div>
			// 	</div>
			// </div>
			let hero = document.createElement("div");
			hero.classList.add("hero-center-section");
			hero.id = view.Anchor;
			let left_text = document.createElement("div");
			left_text.classList.add("left-text");
			left_text.textContent = view.Name;
			hero.appendChild(left_text);
			let container = document.createElement("div");
			container.classList.add("container");
			let row = document.createElement("div");
			row.classList.add("row");
			row.classList.add("justify-content-center");
			let col = document.createElement("div");
			col.classList.add("col-md-8");
			let img_wrap = document.createElement("div");
			img_wrap.classList.add("img-wrap");
			let img = document.createElement("img");
			img.src = view.Logo;
			img_wrap.appendChild(img);
			col.appendChild(img_wrap);
			row.appendChild(col);
			container.appendChild(row);
			hero.appendChild(container);
			$("body").prepend(hero);
			/* #endregion */
			/* #region Add slide-button */
			// <li class="">
			// 	<a href="#nature" class="hover-target" data-hover="nature">nature</a>
			// </li>
			let slide_button = document.createElement("li");
			let slide_button_a = document.createElement("a");
			slide_button_a.href = "#" + view.Anchor;
			slide_button_a.classList.add("hover-target");
			slide_button_a.dataset.hover = view.Anchor;
			slide_button_a.dataset.hover2 = view.Name;
			slide_button_a.textContent = view.Name;
			slide_button.appendChild(slide_button_a);
			$(".slide-buttons").append(slide_button);
			/* #endregion */
		}
		/* #endregion */
		/* #region Generate mouseenter listener on all side-buttons */
		$(".slide-buttons li").on("mouseenter", function () {
			$(".slide-buttons li.active").removeClass("active");
			$(".hero-center-section.show").removeClass("show");

			let hover_target = $(this).children("a").data("hover");
			$(".hero-center-section#" + hover_target).addClass("show");
			$(this).addClass("active");
		});
		$(".slide-buttons li a").on("click", function (e) {
			generateModalx($(this).data("hover"));
		});
		/* #endregion */
		/* #region Trigger mouse enter on #hash or first entry */
		let target = location.hash.substring(1);
		if (target) {
			$(".slide-buttons li a[data-hover=\"" + target + "\"]").parent().trigger("mouseenter");
		} else {
			$(".slide-buttons li:nth-child(1)").trigger("mouseenter");
		}
		/* #endregion */

		let $grid = $('.modalx .grid').masonry({
			itemSelector: '.grid-item',
			columnWidth: '.grid-sizer',
			percentPosition: true
		});

		$(".modalx-close").on("click", function () {
			closeModalx();
		});
	});
})(jQuery);

function closeModalx() {
	let modalx = document.querySelector(".modalx");
	modalx.classList.remove("show");
	modalx.classList.add("hide");
}

function showModalx() {
	let modalx = document.querySelector(".modalx");
	modalx.classList.remove("hide");
	modalx.classList.add("show");
}

function toggleModalx() {
	let modalx = document.querySelector(".modalx");
	if (modalx.hasClass("show")) {
		closeModalx();
	} else {
		showModalx();
	}
}

function generateModalx(anchor) {
	let modalx = document.querySelector(".modalx");
	let gridItems = document.querySelectorAll(".modalx .grid-item");
	for (let i = 0; i < gridItems.length; i++) {
		gridItems[i].remove();
	}
	let view;
	for (let i = 0; i < views.length; i++) {
		let view2 = views[i];
		if (view2.Anchor == anchor) {
			view = view2;
			break;
		}
	}
	if (view === undefined) {
		return;
	}
	document.querySelector(".modalx .modalx-title").textContent = view.Name;
	let grid = document.querySelector(".modalx .grid");
	for (let i = 0; i < view.Entries.length; i++) {
		let entry = view.Entries[i];
		let gridItem = document.createElement("div");
		gridItem.classList.add("grid-item");
		let link = document.createElement("a");
		link.href = entry.Link;
		link.target = "_blank";
		let img = document.createElement("img");
		img.src = entry.Image;
		let overlay = document.createElement("div");
		overlay.classList.add("modalx-overlay");
		let overlay_text = document.createElement("span");
		overlay_text.classList.add("modalx-overlay-text");
		overlay_text.textContent = entry.Title;
		overlay.appendChild(overlay_text);
		let overlay_text2 = document.createElement("span");
		overlay_text2.classList.add("modalx-overlay-text2");
		overlay_text2.textContent = entry.Views;
		overlay.appendChild(overlay_text2);
		link.appendChild(img);
		link.appendChild(overlay);
		gridItem.appendChild(link);
		grid.appendChild(gridItem);
	}
	modalx.classList.remove("hide");
	modalx.classList.add("show");
}