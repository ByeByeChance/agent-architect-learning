export const weatherTool = {
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "获取指定城市的当前天气信息",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，如 '北京'、'Shanghai'",
        },
      },
      required: ["city"],
    },
  },
};

export async function getWeather(city: string): Promise<string> {
  const weatherData: Record<string, string> = {
    北京: "晴，25°C，湿度 40%",
    上海: "多云，28°C，湿度 65%",
    深圳: "阵雨，30°C，湿度 80%",
  };
  return weatherData[city] || `未找到 ${city} 的天气数据`;
}
