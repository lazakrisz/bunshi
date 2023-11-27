import { renderHook } from "@testing-library/react";
import React, { StrictMode, useContext } from "react";
import {
  createScope,
  getDefaultInjector,
  molecule,
  onMount,
  onUnmount,
  resetDefaultInjector,
  use,
} from ".";
import { ScopeProvider } from "./ScopeProvider";
import { ScopeContext } from "./contexts/ScopeContext";
import { strictModeSuite } from "./testing/strictModeSuite";
import { useMolecule } from "./useMolecule";
import { useMolecule2 } from "./useScopes";

export const UserScope = createScope("user@example.com", {
  debugLabel: "User Scope",
});

export const UserMolecule = molecule((_, getScope) => {
  const userId = getScope(UserScope);

  return {
    example: Math.random(),
    userId,
  };
});

strictModeSuite(({ wrapper }) => {
  describe("useMolecule", () => {
    test("Use molecule can have scope provided", () => {
      const useUserMolecule = () => {
        return {
          molecule: useMolecule(UserMolecule, {
            withScope: [UserScope, "jeffrey@example.com"],
          }),
        };
      };
      const { result } = renderHook(useUserMolecule, {});

      expect(result.current.molecule.userId).toBe("jeffrey@example.com");
    });
    test("Provided scope ignores wrappers scope", () => {
      const Wrapper = ({ children }: { children?: React.ReactNode }) => (
        <ScopeProvider scope={UserScope} value={"sam@example.com"}>
          {children}
        </ScopeProvider>
      );

      const useUserMolecule = () => {
        return {
          molecule: useMolecule(UserMolecule, {
            withScope: [UserScope, "jeffrey@example.com"],
          }),
          context: useContext(ScopeContext),
        };
      };
      const { result } = renderHook(useUserMolecule, {
        wrapper: Wrapper,
      });

      expect(result.current.context).toStrictEqual([
        [UserScope, "sam@example.com"],
      ]);
      expect(result.current.molecule.userId).toBe("jeffrey@example.com");
    });

    test("Exclusive scope ignores wrappers scope", () => {
      const Wrapper = ({ children }: { children?: React.ReactNode }) => (
        <ScopeProvider scope={UserScope} value={"implicit@example.com"}>
          {children}
        </ScopeProvider>
      );

      const useUserMolecule = () => {
        return {
          molecule: useMolecule(UserMolecule, {
            exclusiveScope: [UserScope, "exclusive@example.com"],
          }),
          context: useContext(ScopeContext),
        };
      };
      const { result } = renderHook(useUserMolecule, {
        wrapper: Wrapper,
      });

      expect(result.current.context).toStrictEqual([
        [UserScope, "implicit@example.com"],
      ]);
      expect(result.current.molecule.userId).toBe("exclusive@example.com");
    });

    test("Unique scope will generate a new value for each use", () => {
      const useUserMolecule = () => {
        return {
          molecule1: useMolecule(UserMolecule, {
            withUniqueScope: UserScope,
          }),
          molecule2: useMolecule(UserMolecule, {
            withUniqueScope: UserScope,
          }),
        };
      };
      const { result } = renderHook(useUserMolecule, {});

      expect(result.current.molecule1.userId).not.toBe(
        result.current.molecule2.userId,
      );
    });

    test("Empty options breaks nothing", () => {
      const useUserMolecule = () => {
        return {
          molecule: useMolecule(UserMolecule, {}),
        };
      };
      const { result } = renderHook(useUserMolecule, {});

      expect(result.current.molecule.userId).toBe("user@example.com");
    });

    describe("Lifecyle hooks run with React", () => {
      const runs = vi.fn();
      const mounts = vi.fn();
      const unmounts = vi.fn();

      const UseLifecycleMolecule = molecule(() => {
        const userId = use(UserScope);
        onMount(() => {
          mounts(userId);
          return () => {
            unmounts("indirect", userId);
          };
        });

        onUnmount(() => {
          unmounts("direct", userId);
        });

        runs(userId);
        return userId;
      });

      const jeffry = "jeffrey@example.com";
      const useUserMolecule = () => {
        return {
          molecule: useMolecule(UseLifecycleMolecule, {
            withScope: [UserScope, jeffry],
          }),
        };
      };

      beforeEach(() => {
        runs.mockReset();
        mounts.mockReset();
        unmounts.mockReset();
      });

      test("Works with withScope", () => {
        expectUserLifecycle(useUserMolecule, jeffry);
      });

      test("Works with default scope", () => {
        const testHook = () => {
          return {
            molecule: useMolecule(UseLifecycleMolecule),
          };
        };
        expectUserLifecycle(testHook, "user@example.com");
      });

      function expectUserLifecycle(
        testHook: typeof useUserMolecule,
        expectedUser: string,
      ) {
        expect(runs).not.toBeCalled();
        expect(mounts).not.toBeCalled();
        expect(unmounts).not.toBeCalled();

        const run1 = renderHook(testHook, {
          wrapper,
        });

        expect(runs).toBeCalledWith(expectedUser);
        expect(mounts).toBeCalledWith(expectedUser);
        expect(unmounts).not.toBeCalled();

        expect(run1.result.current.molecule).toBe(expectedUser);

        const run2 = renderHook(testHook, {
          wrapper,
        });

        expect(runs).toBeCalledTimes(1);
        expect(mounts).toBeCalledTimes(1);
        expect(unmounts).not.toBeCalled();
        expect(run2.result.current.molecule).toBe(expectedUser);

        run1.unmount();

        expect(runs).toBeCalledTimes(1);
        expect(mounts).toBeCalledTimes(1);
        // Then unmounts aren't called
        expect(unmounts).not.toBeCalled();

        run2.unmount();

        expect(runs).toBeCalledTimes(1);
        expect(mounts).toBeCalledTimes(1);
        // Then both unmounts are called
        expect(unmounts).toBeCalledTimes(2);
        expect(unmounts).toHaveBeenNthCalledWith(1, "indirect", expectedUser);
        expect(unmounts).toHaveBeenNthCalledWith(2, "direct", expectedUser);
      }
    });

    test("Empty", () => {});
  });
});

test.only("Strict mode failure", () => {
  const expectedUser = "johan";

  const runs = vi.fn();
  const mounts = vi.fn();
  const unmounts = vi.fn();
  const UseLifecycleMolecule = molecule(() => {
    const userId = use(UserScope);
    onMount(() => {
      mounts(userId);
      return function indirect() {
        unmounts("indirect", userId);
      };
    });

    onUnmount(function direct() {
      unmounts("direct", userId);
    });

    runs(userId);
    return userId;
  });
  const testHook = () => {
    return {
      molecule: useMolecule2(UseLifecycleMolecule, {
        exclusiveScope: [UserScope, expectedUser],
      }),
    };
  };

  expect(runs).not.toBeCalled();
  expect(mounts).not.toBeCalled();
  expect(unmounts).not.toBeCalled();

  const run1 = renderHook(testHook, {
    wrapper: StrictMode,
  });

  expect(runs).toBeCalledWith(expectedUser);
  expect(mounts).toBeCalledWith(expectedUser);
  // expect(unmounts).not.toBeCalled();

  expect(runs).toBeCalledTimes(2);
  expect(mounts).toBeCalledTimes(2);
  expect(unmounts).toBeCalledTimes(4);

  expect(run1.result.current.molecule).toBe(expectedUser);

  // const run2 = renderHook(testHook, {
  //   wrapper: StrictMode,
  // });

  expect(runs).toBeCalledTimes(2);
  expect(unmounts).toBeCalledTimes(4);
  // expect(mounts).toBeCalledTimes(1);
  // expect(unmounts).not.toBeCalled();
  // expect(run2.result.current.molecule).toBe(expectedUser);

  console.log("============Mounted===============");
  run1.unmount();

  // expect(runs).toBeCalledTimes(1);
  // expect(mounts).toBeCalledTimes(1);
  // // Then unmounts aren't called
  // expect(unmounts).not.toBeCalled();

  // run2.unmount();

  expect(runs).toBeCalledTimes(2);
  expect(mounts).toBeCalledTimes(2);
  // Then both unmounts are called
  expect(unmounts).toBeCalledTimes(4);
  expect(unmounts).toHaveBeenNthCalledWith(1, "indirect", expectedUser);
  expect(unmounts).toHaveBeenNthCalledWith(2, "direct", expectedUser);
});
