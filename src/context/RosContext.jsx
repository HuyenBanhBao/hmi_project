import { createContext, useContext } from "react";
import useRosConnection from "../hooks/useRosConnection";

const RosContext = createContext(null);

export const RosProvider = ({ children }) => {
    const rosData = useRosConnection();

    return <RosContext.Provider value={rosData}>{children}</RosContext.Provider>;
};

export const useRos = () => {
    return useContext(RosContext);
};
