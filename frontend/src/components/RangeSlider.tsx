import React from "react";

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  label?: string;
  suffix?: string;
  formatLabel?: (val: number, type: "min" | "max") => React.ReactNode;
}

export function RangeSlider({
  min,
  max,
  step,
  value,
  onChange,
  label,
  suffix = "₽",
  formatLabel,
}: RangeSliderProps) {
  const [leftVal, rightVal] = value;

  const isNonLinear = max === 1000000;

  const sliderToValue = (sliderVal: number) => {
    if (!isNonLinear) return sliderVal;
    if (sliderVal <= 100) {
      return Math.round((sliderVal * 1000) / 1000) * 1000;
    } else {
      const rawVal = 100000 + (sliderVal - 100) * 9000;
      return Math.round(rawVal / 10000) * 10000;
    }
  };

  const valueToSlider = (val: number) => {
    if (!isNonLinear) return val;
    if (val <= 100000) {
      return val / 1000;
    } else {
      return 100 + ((val - 100000) / 900000) * 100;
    }
  };

  const sliderMin = isNonLinear ? valueToSlider(min) : min;
  const sliderMax = isNonLinear ? 200 : max;
  const sliderStep = isNonLinear ? 0.01 : step;

  const leftSliderVal = valueToSlider(leftVal);
  const rightSliderVal = valueToSlider(rightVal);

  const handleLeftChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = sliderToValue(Number(e.target.value));
    const gap = isNonLinear ? (rightVal <= 100000 ? 1000 : 10000) : step;
    if (val > rightVal - gap) {
      val = rightVal - gap;
    }
    onChange([val, rightVal]);
  };

  const handleRightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = sliderToValue(Number(e.target.value));
    const gap = isNonLinear ? (leftVal < 100000 ? 1000 : 10000) : step;
    if (val < leftVal + gap) {
      val = leftVal + gap;
    }
    onChange([leftVal, val]);
  };

  const minPercent = ((leftSliderVal - sliderMin) / (sliderMax - sliderMin)) * 100;
  const maxPercent = ((rightSliderVal - sliderMin) / (sliderMax - sliderMin)) * 100;

  const formatNum = (num: number) => {
    return num.toLocaleString("ru-RU");
  };

  return (
    <div className="w-full flex flex-col">
      {label && (
        <span className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </span>
      )}

      <div className="relative w-full h-6 flex items-center select-none">
        {/* неактивный трек */}
        <div className="absolute left-0 right-0 h-1.5 bg-gray-200 rounded-full pointer-events-none" />

        {/* активный трек */}
        <div
          className="absolute h-1.5 bg-primary rounded-full pointer-events-none"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
          }}
        />

        {/* левый ползунок*/}
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={leftSliderVal}
          onChange={handleLeftChange}
          className="absolute w-full h-[18px] bg-transparent pointer-events-none appearance-none focus:outline-none z-20 slider-thumb-primary"
        />

        {/* правый ползунок */}
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={rightSliderVal}
          onChange={handleRightChange}
          className="absolute w-full h-[18px] bg-transparent pointer-events-none appearance-none focus:outline-none z-20 slider-thumb-primary"
        />
      </div>

      {/* подписи под ползунками */}
      <div className="flex justify-between items-center h-5">
        <div>
          {leftVal > min && (
            <span className="text-sm font-medium text-gray-500">
              {formatLabel ? formatLabel(leftVal, "min") : `от ${formatNum(leftVal)} ${suffix}`}
            </span>
          )}
        </div>
        <div>
          {rightVal < max && (
            <span className="text-sm font-medium text-gray-500">
              {formatLabel ? formatLabel(rightVal, "max") : `до ${formatNum(rightVal)} ${suffix}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
