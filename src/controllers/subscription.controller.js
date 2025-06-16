import mongoose, {isValidObjectId} from "mongoose"
import {User} from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const validateAndFindUser = async (id, errorMsg) => {
    if (!isValidObjectId(id)) throw new ApiError(400, `Invalid ${errorMsg.toLowerCase()} ID`)
    const user = await User.findById(id)
    if (!user) throw new ApiError(404, `${errorMsg} not found`)
    return user
}

const toggleSubscription = asyncHandler(async (req, res) => {
    const {channelId} = req.params
    
    await validateAndFindUser(channelId, "Channel")
    if (channelId === req.user._id.toString()) {
        throw new ApiError(400, "You cannot subscribe to your own channel")
    }

    const existingSubscription = await Subscription.findOne({
        subscriber: req.user._id,
        channel: channelId
    })

    if (existingSubscription) {
        await Subscription.findByIdAndDelete(existingSubscription._id)
        return res.status(200).json(new ApiResponse(200, { subscribed: false }, "Unsubscribed successfully"))
    } else {
        await Subscription.create({ subscriber: req.user._id, channel: channelId })
        return res.status(200).json(new ApiResponse(200, { subscribed: true }, "Subscribed successfully"))
    }
})

const createSubscriberPipeline = (channelId, userId) => [
    { $match: { channel: new mongoose.Types.ObjectId(channelId) }},
    {
        $lookup: {
            from: "users",
            localField: "subscriber",
            foreignField: "_id",
            as: "subscriber",
            pipeline: [
                { $lookup: { from: "subscriptions", localField: "_id", foreignField: "channel", as: "subscribedToSubscriber" }},
                {
                    $addFields: {
                        subscribersCount: { $size: "$subscribedToSubscriber" },
                        isSubscribed: { $in: [userId, "$subscribedToSubscriber.subscriber"] }
                    }
                },
                { $project: { username: 1, fullName: 1, avatar: 1, subscribersCount: 1, isSubscribed: 1 }}
            ]
        }
    },
    { $unwind: "$subscriber" },
    { $project: { _id: 0, subscriber: 1, subscribedDate: "$createdAt" }}
]

const createChannelPipeline = (subscriberId) => [
    { $match: { subscriber: new mongoose.Types.ObjectId(subscriberId) }},
    {
        $lookup: {
            from: "users",
            localField: "channel",
            foreignField: "_id",
            as: "channel",
            pipeline: [
                { $lookup: { from: "subscriptions", localField: "_id", foreignField: "channel", as: "subscribers" }},
                { $addFields: { subscribersCount: { $size: "$subscribers" }}},
                { $project: { username: 1, fullName: 1, avatar: 1, subscribersCount: 1 }}
            ]
        }
    },
    { $unwind: "$channel" },
    { $project: { _id: 0, channel: 1, subscribedDate: "$createdAt" }}
]

const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const {channelId} = req.params
    const { page = 1, limit = 10 } = req.query

    await validateAndFindUser(channelId, "Channel")

    const subscribers = await Subscription.aggregatePaginate(
        Subscription.aggregate(createSubscriberPipeline(channelId, req.user._id)),
        { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    )

    return res.status(200).json(new ApiResponse(200, subscribers, "Subscribers fetched successfully"))
})

const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params
    const { page = 1, limit = 10 } = req.query

    await validateAndFindUser(subscriberId, "Subscriber")

    const subscribedChannels = await Subscription.aggregatePaginate(
        Subscription.aggregate(createChannelPipeline(subscriberId)),
        { page: parseInt(page, 10), limit: parseInt(limit, 10) }
    )

    return res.status(200).json(new ApiResponse(200, subscribedChannels, "Subscribed channels fetched successfully"))
})

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels
}