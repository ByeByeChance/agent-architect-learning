import tokens from "./tokens.json";

export default {
  theme: {
    extend: {
      colors: {
        primary: tokens.colors.primary,
        neutral: tokens.colors.neutral,
        accent: tokens.colors.accent,
      },
      spacing: tokens.spacing,
      fontFamily: tokens.typography.fontFamily,
      fontSize: tokens.typography.fontSize,
      borderRadius: tokens.borderRadius,
    },
  },
};
