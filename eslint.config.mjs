import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  { ignores: ["design-previews/**"] },
  ...nextVitals
];

export default eslintConfig;
