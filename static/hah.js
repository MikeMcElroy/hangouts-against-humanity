/* global gapi,angular */
'use strict';

function drawCardFromDeck(getJSONValue, setJSONValue, deckKey) {
  var get = getJSONValue.bind(null, deckKey),
      set = setJSONValue.bind(null, deckKey);

  return function(num) {
    var deck = get(),
        deckLen = deck.length,
        cards = [],
        number = num || 1;

    if(number < deckLen) {
      cards = deck.splice(0, number);
    } else {
      cards = deck;
      deck = [];
    }

    set(deck);
    return cards;
  };
}

angular.module('HangoutsAgainstHumanity', ['ngAnimate'])
  .factory('submitDelta', ['$timeout', function($timeout) {
    var next_submit,
        d;
    return function(delta) {
      if(!next_submit) {
        d = {};
        next_submit = $timeout(function() {
          gapi.hangout.data.submitDelta(d);
          next_submit = undefined;
        }, 20);
      }
      for (var i in delta) {
        d[i] = JSON.stringify(delta[i] || null);
      }
    };
  }])
  .factory('setJSONValue', ['submitDelta', function(submitDelta) {
    return function(key, value) {
      var delta = {};
      delta[key] = value;
      submitDelta(delta);
    };
  }])
  .constant('getJSONValue', function(key) { return JSON.parse(gapi.hangout.data.getValue(key) || null); })
  .constant('whiteCardKey', 'white_cards')
  .constant('blackCardKey', 'black_cards')
  .constant('activeBlackCardKey', 'active_black_card')
  .constant('currentReaderKey', 'current_reader')
  .constant('currentStateKey', 'current_state')
  .constant('winnerKey', 'winner')
  .constant('listeningForSubmissionKey', 'listening')
  .constant('shuffle', function(array) {
    var i, j, swapped,
        arrLen = array.length;

    for (i = ((arrLen - 1) * 3); i >= 0; i--) {
      j = Math.floor(Math.random() * arrLen);
      swapped = array[i % arrLen];
      array[i % arrLen] = array[j];
      array[j] = swapped;
    }

    return array;
  })
  .factory('localParticipantId', function() {
    return gapi.hangout.getLocalParticipantId();
  })
  .factory('localParticipantCards', ['localParticipantId', function(localParticipantId) {
    return 'cards_' + localParticipantId;
  }])
  .factory('localParticipantNewCards', ['localParticipantId', function(localParticipantId) {
    return 'new_' + localParticipantId;
  }])
  .factory('drawWhiteCards', ['getJSONValue', 'setJSONValue', 'whiteCardKey', drawCardFromDeck])
  .factory('drawBlackCards', ['getJSONValue', 'setJSONValue', 'blackCardKey', drawCardFromDeck])
  .factory('drawNewQuestion', ['drawBlackCards', 'setJSONValue', 'activeBlackCardKey', function(drawBlackCards, setJSONValue, activeBlackCardKey) {
    return function() {
      setJSONValue(activeBlackCardKey, drawBlackCards(1)[0]);
    };
  }])
  .factory('submitCards', ['setJSONValue', 'localParticipantCards', 'whiteCards', function(setJSONValue, localParticipantCards, whiteCards) {
    var white;
    whiteCards().then(function(cards) {
      white = cards;
    });
    return function(cards) {
      var cardIds = [], i = 0, len = cards.length;

      for( ; i < len ; i++) {
        cardIds[i] = white.indexOf(cards[i]);
      }

      setJSONValue(localParticipantCards, cardIds);
    };
  }])
  .factory('watchForNewParticipants', [function() {
    return function(callback) {
      var func = function(evt) {
            callback(evt.enabledParticipants);
          },
          cancel = function() {
            gapi.hangout.onParticipantsEnabled.remove(func);
          };

      gapi.hangout.onParticipantsEnabled.add(func);
      return cancel;
    };
  }])
  .factory('watchForSubmittedCards', ['$filter', 'getJSONValue', 'submitDelta', 'listeningForSubmissionKey', 'whiteCards', function($filter, getJSONValue, submitDelta, listeningForSubmissionKey, whiteCards) {
    return function(callback) {
      var func = function(evt) {
            var newCards = $filter('filter')(evt.addedKeys, function(x) {
              return x.key.search('cards_') === 0;
            });
            whiteCards().then(function(white) {
              angular.forEach(newCards, function(obj) {
                obj.value = getJSONValue(obj.key);
                angular.forEach(obj.value, function(cardId, i) {
                  obj.value[i] = white[cardId];
                });
              });
              if(!!newCards.length) {
                callback(newCards);
              }
            });
          },
          cancel = function() {
            gapi.hangout.data.onStateChanged.remove(func);
            delta[listeningForSubmissionKey] = false;
            submitDelta(delta);
          },
          delta = {};

      delta[listeningForSubmissionKey] = true;
      submitDelta(delta);
      gapi.hangout.data.onStateChanged.add(func);

      return cancel;
    };
  }])
  .factory('sendCards', ['submitDelta', function(submitDelta) {

    return function(arrayOfCardsToPlayers) {
      var delta = {};

      angular.forEach(arrayOfCardsToPlayers, function(cardsToPlayer) {
        delta['new_' + cardsToPlayer.player] = cardsToPlayer.cards;
      });

      submitDelta(delta);
    };
  }])
  .factory('whiteCards', ['$http', '$q', function($http, $q) {
    var whiteCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/whitecards.json').then(function(response) {
          return (whiteCards = response.data);
        });
    return function() {
      if(!whiteCards) {
        return promise;
      } else {
        return $q.when(whiteCards);
      }
    };
  }])
  .factory('blackCards', ['$http', '$q', function($http, $q) {
    var blackCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/blackcards.json').then(function(response) {
          return (blackCards = response.data);
        });
    return function() {
      if(!blackCards) {
        return promise;
      } else {
        return $q.when(blackCards);
      }
    };
  }])
  .run(['submitDelta', 'shuffle', 'whiteCardKey', 'blackCardKey', 'currentReaderKey', 'localParticipantId', 'sendCards', 'whiteCards', 'blackCards', '$q', 'gameState', function(submitDelta, shuffle, whiteCardKey, blackCardKey, currentReaderKey, localParticipantId, sendCards, whiteCards, blackCards, $q, gameState) {

    function saveDeck(cardKey) {
      return function(cardIds) {
        var x = {};
        x[cardKey] = cardIds;
        submitDelta(x);
      };
    }

    function buildDeck(cards) {
      var c = [],
          i = 0, len = cards.length;

      for( ; i < len ; i++) {
        c[i] = i;
      }
      return shuffle(c);
    }

    function ifNotAlreadySaved(cardKey) {
      return function(cards) {
        if (angular.isUndefined(gapi.hangout.data.getValue(cardKey))) {
          return cards;
        } else {
          return $q.reject();
        }
      };
    }

    whiteCards()
      .then(ifNotAlreadySaved(whiteCardKey))
      .then(buildDeck)
      .then(function pullMyCards(cardIds) {
        if(angular.isUndefined(gapi.hangout.data.getValue(currentReaderKey))) {
          var x = {};
          x[currentReaderKey] = localParticipantId;
          submitDelta(x);

          sendCards([
            {
              player: localParticipantId,
              cards: cardIds.splice(0,10)
            }]);
        }
        return cardIds;
      })
      .then(saveDeck(whiteCardKey));

    blackCards()
      .then(ifNotAlreadySaved(blackCardKey))
      .then(buildDeck)
      .then(saveDeck(blackCardKey));

  }])
  .factory('gameState', ['activeBlackCardKey', 'currentReaderKey', 'listeningForSubmissionKey', 'localParticipantNewCards', 'getJSONValue', 'whiteCards', 'blackCards', '$rootScope', function(activeBlackCardKey, currentReaderKey, listeningForSubmissionKey, localParticipantNewCards, getJSONValue, whiteCards, blackCards, $rootScope) {
    var item = {},
        white, black;

    whiteCards().then(function(cards) {
      var newCards = getJSONValue(localParticipantNewCards);
      item.newCards = [];
      if (angular.isArray(newCards)) {
        angular.forEach(newCards, function(cardId, i) {
          item.newCards[i] = cards[cardId];
        });
      }
      return cards;
    }).then(function(cards) {
      white = cards;
    });
    blackCards().then(function(cards) {
      var activeQuestion = getJSONValue(activeBlackCardKey);
      item.activeQuestion = cards[activeQuestion || ''] || { text: '' };
      return cards;
    }).then(function(cards) {
      black = cards;
    });
    item.currentReader = getJSONValue(currentReaderKey);
    item.canSubmit = getJSONValue(listeningForSubmissionKey);

    gapi.hangout.data.onStateChanged.add(
      function(evt) {
        var questionChange,
            readerChange,
            canSubmit,
            newCards;

        questionChange = evt.addedKeys.some(function(v) { return v.key === activeBlackCardKey; });
        readerChange = evt.addedKeys.some(function(v) { return v.key === currentReaderKey; });
        canSubmit = evt.addedKeys.some(function(v) { return v.key === listeningForSubmissionKey; });
        newCards = evt.addedKeys.some(function(v) { return v.key === localParticipantNewCards; });

        if(questionChange || readerChange || canSubmit || newCards) {
          item.activeQuestion = (questionChange ? black[getJSONValue(activeBlackCardKey)] : item.activeQuestion);
          item.currentReader = (readerChange ? getJSONValue(currentReaderKey) : item.currentReader);
          item.canSubmit = (canSubmit ? getJSONValue(listeningForSubmissionKey) : item.canSubmit);
          if(newCards) {
            item.newCards = [];
            angular.forEach(getJSONValue(localParticipantNewCards), function(c, i) {
              item.newCards[i] = white[c];
            });
            gapi.hangout.data.clearValue(localParticipantNewCards);
          }
          $rootScope.$apply();
        }
      });
    return item;
  }])
  .controller('TableCtrl', ['$scope', '$sce', 'drawWhiteCards', 'gameState', 'localParticipantId', 'submitCards', 'watchForSubmittedCards', 'drawNewQuestion', 'submitDelta', 'currentReaderKey', 'watchForNewParticipants', 'sendCards', 'activeBlackCardKey', function($scope, $sce, drawWhiteCards, gameState, localParticipantId, submitCards, watchForSubmittedCards, drawNewQuestion, submitDelta, currentReaderKey, watchForNewParticipants, sendCards, activeBlackCardKey) {
    var cancelReader,
        cancelNewParticipantsWatch,
        blankCard = { text: '' };

    function ChangeOfActiveQuestion() {
      return gameState.activeQuestion;
    }

    function AmICurrentReader() {
      return gameState.currentReader === localParticipantId;
    }

    function CanSubmit() {
      return gameState.canSubmit;
    }

    function NewCardsDealt() {
      return gameState.newCards;
    }

    $scope.hand = [];
    $scope.submittedCards = [];

    $scope.selectCard = function(index) {
      var card = $scope.hand.splice(index, 1)[0];
      $scope.submittedCards.push(card);
    };

    $scope.unselectCard = function(index) {
      var card = $scope.submittedCards.splice(index, 1)[0];
      $scope.hand.push(card);
    };

    $scope.disableSubmit = false;
    var overlays = [],
	padding = 0.1,
	imageResource = gapi.hangout.av.createImageResource('data:image/png;base64,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');

    for (var i = 0; i < 3; i++) {
      overlays.unshift(imageResource.createOverlay({position: {x: -0.5 + (padding*i), y: 0.5 - (padding*i)}}));
    }

    $scope.submitCards = function(cards) {
      submitCards(cards);
      angular.forEach(cards, function() {
	overlays[i].setVisible(true);
      });
      $scope.submittedCards = [];
      $scope.disableSubmit = true;
    };

    $scope.isReader = false;

    $scope.$watch(ChangeOfActiveQuestion, function(newVal) {
        $scope.disableSubmit = !newVal;
        $scope.question = (!!newVal ? newVal : blankCard);
        $scope.question.text = $sce.trustAsHtml($scope.question.text);
    });

    $scope.$watch(AmICurrentReader, function(newVal) {
      $scope.isReader = newVal;
      if(newVal) {
        $scope.disableDrawQuestion = false;
        $scope.disableShowAnswers = true;
        $scope.disableMoveToNext = true;
        cancelNewParticipantsWatch = watchForNewParticipants(function(participants) {
          var delta = {},
              newCards = drawWhiteCards(10 * participants.length);

          angular.forEach(participants, function(p) {
            delta['new_' + p.id] = newCards.splice(0, 10);
          });

          submitDelta(delta);
        });
      }
    });

    $scope.$watch(CanSubmit, function(newVal) {
      if(!!newVal) {
        $scope.disableSubmit = false;
      } else {
	angular.forEach(overlays, function(o) {
	  o.setVisible(false);
	});
        $scope.disableSubmit = true;
      }
    });

    $scope.$watch(NewCardsDealt, function(newVal) {
      if(angular.isArray(newVal)) {
        $scope.hand = $scope.hand.concat(newVal);
      }
    });

    /* Dealer-specific */
    $scope.submittedPlayers = [];

    $scope.moveToNext = function() {

      var delta = {},
          enabledParticipants = gapi.hangout.getEnabledParticipants().map(function(x) { return x.id; }).sort(),
          me_index = enabledParticipants.indexOf(localParticipantId),
          newCards = [];

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;

      delta[currentReaderKey] = enabledParticipants[(me_index + 1) % enabledParticipants.length];
      delta[activeBlackCardKey] = '';

      newCards = [];
      var x = drawWhiteCards($scope.submittedPlayers.reduce(function(y, a) { return y.submission.length + a; }, 0));
      newCards = $scope.submittedPlayers.map(function(players) {
        return {
          cards: x.splice(0, players.submission.length),
          player: players.player
        };
      });

      $scope.submittedPlayers = [];
      sendCards(newCards);
      submitDelta(delta, gapi.hangout.data.getKeys().filter(function(x) { return x.search('cards_') === 0; }));
      cancelNewParticipantsWatch();
    };

    $scope.showAnswers = function() {
      cancelReader();

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = false;
    };

    $scope.drawNewQuestion = function() {
      $scope.submittedPlayers = [];
      drawNewQuestion();
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = false;
      $scope.disableMoveToNext = true;

      cancelReader = watchForSubmittedCards(function(newSubmissions) {
        angular.forEach(newSubmissions, function(submission) {
          $scope.submittedPlayers.push({
              player: submission.lastWriter,
              submission: submission.value
          });
        });
      });
    };

  }]);

