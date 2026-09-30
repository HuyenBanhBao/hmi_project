import { useCallback, useEffect, useRef } from "react";
import * as ROSLIB from "roslib";
import { useRos } from "../context/RosContext";

const useRosPublisher = (topicName, messageType) => {
    const { rosConnections, isConnected } = useRos();
    const topicRefs = useRef([]);

    useEffect(() => {
        if (!rosConnections.length || !isConnected) {
            topicRefs.current = [];
            return;
        }

        const topics = rosConnections.map(({ ros, url }) => {
            const topic = new ROSLIB.Topic({
                ros,
                name: topicName,
                messageType,
            });

            topic.advertise();

            return {
                url,
                topic,
            };
        });

        topicRefs.current = topics;

        return () => {
            topics.forEach(({ url, topic }) => {
                try {
                    topic.unadvertise();
                } catch (error) {
                    console.error(`Lỗi unadvertise topic ${topicName} [${url}]:`, error);
                }
            });

            if (topicRefs.current === topics) {
                topicRefs.current = [];
            }
        };
    }, [rosConnections, isConnected, topicName, messageType]);

    const publish = useCallback((messageData) => {
        if (!topicRefs.current?.length) return false;

        let publishedCount = 0;
        topicRefs.current.forEach(({ url, topic }) => {
            try {
                topic.publish(messageData);
                publishedCount += 1;
            } catch (error) {
                console.error(`Lỗi publish topic ${topicName} [${url}]:`, error);
            }
        });

        return publishedCount > 0;
    }, [topicName]);

    return publish;
};

export default useRosPublisher;
