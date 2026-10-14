/**
 * 官网交互：移动菜单、滚动高亮、进入视口动画。
 */
(function () {
  const nav = document.querySelector(".nav");
  const menu = document.getElementById("menu");
  const links = document.getElementById("nav-links");
  const sections = ["intro", "features", "install", "download"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 8);
    const mark = window.scrollY + 120;
    let current = "";
    sections.forEach((section) => {
      if (section.offsetTop <= mark) current = section.id;
    });
    links.querySelectorAll("a").forEach((link) => {
      const id = (link.getAttribute("href") || "").replace("#", "");
      link.classList.toggle("active", id && id === current);
    });
  }

  menu.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    menu.setAttribute("aria-expanded", open ? "true" : "false");
  });

  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      links.classList.remove("open");
      menu.setAttribute("aria-expanded", "false");
    }
  });

  const reveal = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    reveal.forEach((item) => item.style.animation = "none");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.animation = "rise 0.6s ease forwards";
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.16 });
    reveal.forEach((item) => observer.observe(item));
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
