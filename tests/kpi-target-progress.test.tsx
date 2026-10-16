import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TrendingUp } from "lucide-react";
import { CARD_ACCENTS, ServiceKpiCard } from "@/components/commerce-cards";

vi.mock("@/hooks/use-count-up", () => ({ useCountUp: (value: number) => value }));
afterEach(cleanup);
const props = { title: "Sales", value: "400", target: "1,000 MMK", expected: "Expected: 500", status: "Below Target", statusTone: "bad" as const, icon: TrendingUp, accent: CARD_ACCENTS.sky };

it("keeps an empty track visible when the target is unset", () => {
  render(<ServiceKpiCard {...props} target="No target" progressPercent={0} />);
  const track = screen.getByRole("progressbar", { name: "Sales progress" });
  expect(track).toHaveAttribute("aria-valuenow", "0");
  expect(track).toHaveAttribute("aria-valuetext", "No target set");
  expect(track.children).toHaveLength(1);
});
it("fills against the saved target and positions the elapsed-time marker", () => {
  render(<ServiceKpiCard {...props} progressPercent={40} markerPercent={50} />);
  const track = screen.getByRole("progressbar");
  expect(track).toHaveAttribute("aria-valuenow", "40");
  expect(track.firstElementChild).toHaveStyle({ width: "40%" });
  expect(track.lastElementChild).toHaveStyle({ left: "50%" });
});
it("keeps the track and target marker when the actual value is zero", () => {
  render(<ServiceKpiCard {...props} value="0" progressPercent={0} markerPercent={50} />);
  const track = screen.getByRole("progressbar");
  expect(track.firstElementChild).toHaveStyle({ width: "0%" });
  expect(track.lastElementChild).toHaveStyle({ left: "50%" });
});
it("caps values above target at the end of the track", () => {
  render(<ServiceKpiCard {...props} progressPercent={150} />);
  expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "100%" });
});
