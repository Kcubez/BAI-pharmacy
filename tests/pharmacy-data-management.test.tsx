import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), preview: { data: { total: 2045, counts: { products: 2022, suppliers: 23 } }, isPending: false, isError: false, isFetching: false } }));
vi.mock("@/hooks/use-pharmacy", () => ({
  usePharmacyResetPreview: () => ({ ...mocks.preview, refetch: mocks.refetch }),
  usePharmacyDeleteAll: () => ({ mutateAsync: mocks.mutate, isPending: false }),
}));
import { PharmacyDataManagement } from "@/components/pharmacy-data-management";
afterEach(cleanup);
beforeEach(() => { mocks.mutate.mockResolvedValue({ total: 2045 }); });
it("requires typed confirmation, shows counts and opens Trash after success", async () => {
  render(<PharmacyDataManagement />);
  expect(screen.queryByText("2,022")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View data management" }));
  expect(screen.getByText("2,022")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Move all pharmacy data to Trash" }));
  const confirm = screen.getByRole("button", { name: "Move to Trash" });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "RESET" } });
  expect(confirm).toBeEnabled();
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2,045 records moved to Trash"));
  expect(mocks.mutate).toHaveBeenCalledWith("all");
  expect(screen.getByRole("link", { name: "Open Trash" })).toHaveAttribute("href", "/trash");
});
it("prevents reset during an import", () => {
  render(<PharmacyDataManagement importPending />);
  fireEvent.click(screen.getByRole("button", { name: "View data management" }));
  expect(screen.getByRole("button", { name: "Move all pharmacy data to Trash" })).toBeDisabled();
});
