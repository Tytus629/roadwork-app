import React from "react";
import ReactTestRenderer from "react-test-renderer";
import PavementRepairDetailsEditor from "../src/components/PavementRepairDetailsEditor";
import { SimpleSelect } from "../src/components/ui/SimpleSelect";

describe("PavementRepairDetailsEditor stability", () => {
  it("keeps hook order stable across prop shape changes", () => {
    const onSave = jest.fn();

    let tree: ReactTestRenderer.ReactTestRenderer;
    expect(() => {
      ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
          <PavementRepairDetailsEditor
            initialDetails={undefined}
            onSave={onSave}
            autoSaveOnChange
          />,
        );
      });

      ReactTestRenderer.act(() => {
        tree!.update(
          <PavementRepairDetailsEditor
            initialDetails={{ issueCategory: "pothole", repairMethod: "cold_mix" }}
            onSave={onSave}
            autoSaveOnChange
          />,
        );
      });

      ReactTestRenderer.act(() => {
        tree!.update(
          <PavementRepairDetailsEditor
            initialDetails={undefined}
            onSave={onSave}
            autoSaveOnChange
          />,
        );
      });

      ReactTestRenderer.act(() => {
        tree!.update(
          <PavementRepairDetailsEditor
            initialDetails={{ issueCategory: "edge_break", repairMethod: "wedge_patch" }}
            onSave={onSave}
            autoSaveOnChange
          />,
        );
      });
    }).not.toThrow();
  });

  it("autosave remains bounded after repeated edits", () => {
    const onSave = jest.fn();

    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <PavementRepairDetailsEditor
          initialDetails={{ issueCategory: "pothole" }}
          onSave={onSave}
          autoSaveOnChange
        />,
      );
    });

    const selects = tree!.root.findAllByType(SimpleSelect as any);
    expect(selects.length).toBeGreaterThanOrEqual(2);

    ReactTestRenderer.act(() => {
      selects[0].props.onChange("failed_patch");
      selects[1].props.onChange("full_depth_patch");
      selects[1].props.onChange("cold_mix");
      selects[0].props.onChange("edge_break");
    });

    expect(onSave.mock.calls.length).toBeGreaterThan(0);
    expect(onSave.mock.calls.length).toBeLessThan(12);
  });
});
