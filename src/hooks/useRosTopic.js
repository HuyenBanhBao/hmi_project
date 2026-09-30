import { useEffect, useState, useRef } from "react";
import * as ROSLIB from "roslib";
import { useRos } from "../context/RosContext";

const useRosTopic = (topicName, messageType, topicOptions = {}) => {
    const { rosConnections, isConnected } = useRos();
    const [message, setMessage] = useState(null);
    const topicRefs = useRef([]);
    const { compression = "none", queue_length = 0, throttle_rate = 0 } = topicOptions;

    useEffect(() => {
        if (!rosConnections.length || !isConnected) {
            topicRefs.current = [];
            return undefined;
        }

        const subscriptions = rosConnections.map(({ ros, url }) => {
            const topic = new ROSLIB.Topic({
                ros,
                name: topicName,
                messageType,
                compression,
                queue_length,
                throttle_rate,
            });

            const handleMessage = (msg) => {
                setMessage(msg);
            };

            topic.subscribe(handleMessage);

            return {
                url,
                topic,
                handleMessage,
            };
        });

        topicRefs.current = subscriptions;

        return () => {
            subscriptions.forEach(({ url, topic, handleMessage }) => {
                try {
                    topic.unsubscribe(handleMessage);
                } catch (e) {
                    console.error(`Lỗi unsubscribe topic ${topicName} [${url}]:`, e);
                }
            });

            if (topicRefs.current === subscriptions) {
                topicRefs.current = [];
            }
        };
    }, [rosConnections, isConnected, topicName, messageType, compression, queue_length, throttle_rate]);

    return message;
};

export default useRosTopic;
