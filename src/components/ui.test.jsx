import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastViewport } from "./ui";

afterEach(() => {
  cleanup();
});

describe("ToastViewport", () => {
  it("exposes an accessible close button", () => {
    render(
      <ToastViewport
        toasts={[
          {
            id: "toast-1",
            tone: "success",
            title: "保存しました",
            description: "",
          },
        ]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "閉じる" })).not.toBeNull();
  });
});
