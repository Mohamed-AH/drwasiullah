/* Runs before first paint (classic script in <head>): apply the saved theme so dark-mode users never see a light flash. */
try { var t = localStorage.getItem("theme"); if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
