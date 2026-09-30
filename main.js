// 年份
document.getElementById("year").textContent = new Date().getFullYear();

// 主题切换（记住选择）
const root = document.documentElement;
const btn = document.getElementById("theme");
const saved = localStorage.getItem("theme");
const initial =
  saved ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

apply(initial);
btn.addEventListener("click", () =>
  apply(root.dataset.theme === "light" ? "dark" : "light")
);

function apply(theme) {
  root.dataset.theme = theme;
  btn.textContent = theme === "light" ? "☀" : "☾";
  localStorage.setItem("theme", theme);
}

// 滚动渐入
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
