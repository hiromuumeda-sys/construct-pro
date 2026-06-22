tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
        "surface-container": "#eceef0",
        "secondary-fixed": "#e1e0ff",
        "primary": "#030424",
        "on-tertiary": "#ffffff",
        "primary-fixed-dim": "#c1c3ed",
        "on-secondary-fixed-variant": "#2f2ebe",
        "surface-container-low": "#f2f4f6",
        "on-error-container": "#93000a",
        "primary-container": "#1a1d3d",
        "surface": "#f7f9fb",
        "tertiary": "#000b05",
        "tertiary-fixed-dim": "#4edea3",
        "on-surface-variant": "#46464e",
        "inverse-on-surface": "#eff1f3",
        "inverse-surface": "#2d3133",
        "outline": "#77767f",
        "on-surface": "#191c1e",
        "inverse-primary": "#c1c3ed",
        "surface-bright": "#f7f9fb",
        "on-primary-fixed-variant": "#414466",
        "on-primary": "#ffffff",
        "on-secondary-fixed": "#07006c",
        "secondary-container": "#6063ee",
        "on-primary-container": "#8285ab",
        "on-tertiary-fixed": "#002113",
        "error": "#ba1a1a",
        "tertiary-fixed": "#6ffbbe",
        "surface-container-lowest": "#ffffff",
        "on-primary-fixed": "#151838",
        "error-container": "#ffdad6",
        "surface-variant": "#e0e3e5",
        "on-background": "#191c1e",
        "secondary-fixed-dim": "#c0c1ff",
        "on-tertiary-container": "#009b6b",
        "tertiary-container": "#002617",
        "on-error": "#ffffff",
        "surface-dim": "#d8dadc",
        "outline-variant": "#c7c5cf",
        "on-secondary": "#ffffff",
        "surface-container-highest": "#e0e3e5",
        "surface-tint": "#595c7f",
        "surface-container-high": "#e6e8ea",
        "on-tertiary-fixed-variant": "#005236",
        "background": "#f7f9fb",
        "secondary": "#4648d4",
        "primary-fixed": "#e0e0ff",
        "on-secondary-container": "#fffbff"
      },
      "borderRadius": {
        "DEFAULT": "0.25rem",
        "lg": "16px",
        "xl": "24px",
        "full": "9999px"
      },
      "spacing": {
        "xl": "48px",
        "margin-mobile": "16px",
        "container-max": "1440px",
        "md": "24px",
        "sm": "16px",
        "margin-desktop": "32px",
        "gutter": "24px",
        "xs": "8px",
        "lg": "32px",
        "base": "4px"
      },
      "fontFamily": {
        "display-lg": ["Inter"],
        "body-sm": ["Inter"],
        "label-sm": ["Inter"],
        "headline-sm": ["Inter"],
        "body-md": ["Inter"],
        "body-lg": ["Inter"],
        "headline-md": ["Inter"],
        "label-md": ["Inter"]
      },
      "fontSize": {
        "display-lg": ["32px", {"lineHeight": "40px", "letterSpacing": "-0.02em", "fontWeight": "700"}],
        "body-sm": ["13px", {"lineHeight": "18px", "fontWeight": "400"}],
        "label-sm": ["11px", {"lineHeight": "14px", "fontWeight": "500"}],
        "headline-sm": ["20px", {"lineHeight": "28px", "fontWeight": "600"}],
        "body-md": ["14px", {"lineHeight": "20px", "fontWeight": "400"}],
        "body-lg": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
        "headline-md": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "600"}],
        "label-md": ["12px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600"}]
      }
    },
  },
}

// 全ページ共通の文字サイズ補正（サイズ指定漏れで16px既定になるのを防ぐ）
// ボタン・入力・セレクト・日付ピッカーを13pxに揃え、ボタン内/単体アイコンは18pxに統一。
(function injectGlobalSizeFix() {
  var css = [
    'input, select, textarea { font-size: 13px !important; }',
    'button { font-size: 13px !important; }',
    'button .material-symbols-outlined, button.material-symbols-outlined { font-size: 18px !important; }'
  ].join('\n');
  var add = function () {
    if (document.getElementById('global-size-fix')) return;
    var s = document.createElement('style');
    s.id = 'global-size-fix';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };
  if (document.head) add();
  else document.addEventListener('DOMContentLoaded', add);
})();
